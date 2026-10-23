// ============================================================================
// TizenTube Windows - Native WebView2 Host Application (C# / .NET)
// Copyright (C) 2026 TizenTube Windows Contributors
// Licensed under the GNU General Public License v3.0 (GPL-3.0-only).
// Provides lightweight Win32/WebView2 hosting with aggressive memory optimization,
// network-level adblocking, standalone JS bundle injection, and IPC bridge.
// ============================================================================

using System;
using System.IO;
using System.Drawing;
using System.Windows.Forms;
using System.Runtime.InteropServices;
using System.Diagnostics;
using System.Collections.Generic;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Globalization;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace TizenTubeWindows
{
    public class HostOptions
    {
        public bool SmokeTest { get; set; } = false;
        public int SmokeTestDurationSeconds { get; set; } = 15;
        public string TelemetryFilePath { get; set; } = null;
        public string InitialUrl { get; set; } = "https://www.youtube.com";
        public bool StartMinimized { get; set; } = false;
        public bool HeadlessMode { get; set; } = false;
        public bool ShowHelp { get; set; } = false;

        public static HostOptions Parse(string[] args)
        {
            var options = new HostOptions();
            if (args == null || args.Length == 0) return options;

            for (int i = 0; i < args.Length; i++)
            {
                string arg = args[i];
                if (arg == "--smoke-test" || arg == "-s")
                {
                    options.SmokeTest = true;
                    if (i + 1 < args.Length && int.TryParse(args[i + 1], out int duration))
                    {
                        options.SmokeTestDurationSeconds = duration;
                        i++;
                    }
                }
                else if (arg == "--duration" || arg == "-d")
                {
                    if (i + 1 < args.Length && int.TryParse(args[i + 1], out int duration))
                    {
                        options.SmokeTestDurationSeconds = duration;
                        i++;
                    }
                }
                else if (arg == "--telemetry-file" || arg == "-t")
                {
                    if (i + 1 < args.Length)
                    {
                        options.TelemetryFilePath = args[i + 1];
                        i++;
                    }
                }
                else if (arg == "--url" || arg == "-u")
                {
                    if (i + 1 < args.Length)
                    {
                        options.InitialUrl = args[i + 1];
                        i++;
                    }
                }
                else if (arg == "--minimized")
                {
                    options.StartMinimized = true;
                }
                else if (arg == "--headless")
                {
                    options.HeadlessMode = true;
                }
                else if (arg == "--help" || arg == "-h")
                {
                    options.ShowHelp = true;
                }
            }
            return options;
        }

        public static void PrintHelp()
        {
            Console.WriteLine("==================================================");
            Console.WriteLine("  TizenTube Windows (x64) - Native Host");
            Console.WriteLine("  GPL-3.0-only - https://github.com/Angel52781/tizentube-windows");
            Console.WriteLine("==================================================");
            Console.WriteLine("Usage: TizenTubeHost.exe [options]");
            Console.WriteLine("Options:");
            Console.WriteLine("  --smoke-test [sec]    Run non-interactive smoke test for N seconds, then exit");
            Console.WriteLine("  --telemetry-file <f>  Write process memory & performance telemetry to JSON file");
            Console.WriteLine("  --url <url>           Override initial navigation URL");
            Console.WriteLine("  --minimized           Launch with window initially minimized");
            Console.WriteLine("  --headless            Launch hidden offscreen for CI/automated testing");
            Console.WriteLine("  --help, -h            Show this help message");
        }
    }

    public class Program
    {
        [STAThread]
        public static int Main(string[] args)
        {
            var options = HostOptions.Parse(args);
            if (options.ShowHelp)
            {
                HostOptions.PrintHelp();
                return 0;
            }

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            try
            {
                var mainWindow = new MainWindow(options);
                Application.Run(mainWindow);
                return mainWindow.ExitCode;
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"[FATAL] Host initialization failure: {ex.Message}");
                Console.Error.WriteLine(ex.StackTrace);
                return 1;
            }
        }
    }

    public class MainWindow : Form
    {
        [DllImport("psapi.dll")]
        private static extern bool EmptyWorkingSet(IntPtr hProcess);

        private readonly HostOptions options;
        private WebView2 webView;
        private System.Windows.Forms.Timer memoryTrimTimer;
        private System.Windows.Forms.Timer smokeTestTimer;
        private string appDataDir;
        private long blockedAdCount = 0;
        private long trimCount = 0;
        private long modsInitializedCount = 0;
        private long sponsorBlockSkipCount = 0;
        // Independent check that document-start cosmetic filtering actually
        // reaches a loaded WebView2 DOM (not merely bundled at compile time).
        private long adblockStyleObserved = 0;
        private long adblockRuntimeObserved = 0;
        private DateTime startTimeUtc = DateTime.UtcNow;

        public int ExitCode { get; private set; } = 0;

        public MainWindow(HostOptions options)
        {
            this.options = options ?? new HostOptions();

            this.Text = "TizenTube";
            this.Size = new Size(1280, 720);
            this.MinimumSize = new Size(800, 500);
            this.StartPosition = FormStartPosition.CenterScreen;
            try { this.Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath) ?? SystemIcons.Application; }
            catch { this.Icon = SystemIcons.Application; }

            if (this.options.HeadlessMode)
            {
                this.WindowState = FormWindowState.Minimized;
                this.ShowInTaskbar = false;
                this.Opacity = 0.0;
            }
            else if (this.options.StartMinimized)
            {
                this.WindowState = FormWindowState.Minimized;
            }

            appDataDir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "TizenTube", "UserData"
            );
            Directory.CreateDirectory(appDataDir);

            InitializeWebView();
            SetupMemoryTrimming();

            this.Resize += (s, e) => {
                if (this.WindowState == FormWindowState.Minimized) {
                    TrimMemoryNow();
                }
            };

            if (this.options.HeadlessMode)
            {
                TrimMemoryNow();
            }

            if (this.options.SmokeTest)
            {
                SetupSmokeTestTimer();
            }
        }

        private async void InitializeWebView()
        {
            try
            {
                webView = new WebView2 { Dock = DockStyle.Fill };
                this.Controls.Add(webView);

                // Memory-optimized Chromium CLI arguments:
                // 1. --renderer-process-limit=1: Restricts Chromium to a single renderer process
                // 2. Disable unused Google features to save RAM and background CPU
                // 3. Enable hardware video decoder acceleration (VA-API / HEVC / DXVA)
                // 4. Bound disk and media cache to 100 MB to prevent bloat in long sessions
                string chromiumArgs = 
                    "--renderer-process-limit=1 " +
                    "--disable-features=Translate,OptimizationHints,MediaRouter,CalculateNativeWinOcclusion,InterestFeedContentSuggestions " +
                    "--enable-features=VaapiVideoDecoder,PlatformHEVCDecoderSupport " +
                    "--disk-cache-size=104857600 " +
                    "--media-cache-size=104857600 " +
                    "--disable-background-timer-throttling " +
                    "--disable-renderer-backgrounding " +
                    "--enable-gpu-rasterization " +
                    "--enable-zero-copy";

                var envOptions = new CoreWebView2EnvironmentOptions(chromiumArgs);
                var env = await CoreWebView2Environment.CreateAsync(null, appDataDir, envOptions);
                await webView.EnsureCoreWebView2Async(env);

                ConfigureWebViewSettings();
                SetupLifecycleDiagnostics();
                SetupNetworkAdBlocker();
                SetupFullscreenHandling();
                SetupIpcBridge();
                await InjectModsAsync();

                string navUrl = !string.IsNullOrEmpty(options.InitialUrl) ? options.InitialUrl : "https://www.youtube.com";
                webView.Source = new Uri(navUrl);
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"[ERROR] WebView2 initialization failed: {ex.Message}");
                Debug.WriteLine($"[ERROR] WebView2 initialization failed: {ex}");
                this.ExitCode = 2;
                if (options.SmokeTest)
                {
                    DumpTelemetryReport("initialization-failure");
                    this.Close();
                }
                else
                {
                    try
                    {
                        MessageBox.Show(
                            $"Microsoft Edge WebView2 Runtime could not be initialized.\n\nError: {ex.Message}\n\nPlease install the WebView2 Evergreen Runtime from Microsoft:\nhttps://developer.microsoft.com/en-us/microsoft-edge/webview2/",
                            "TizenTube - Runtime Error",
                            MessageBoxButtons.OK,
                            MessageBoxIcon.Error
                        );
                    }
                    catch { }
                    this.Close();
                }
            }
        }

        private void ConfigureWebViewSettings()
        {
            var settings = webView.CoreWebView2.Settings;
            settings.AreDefaultContextMenusEnabled = true;
            settings.AreDevToolsEnabled = false; // Disabled by default in production to save RAM
            settings.IsStatusBarEnabled = false;
            settings.IsZoomControlEnabled = false;
        }

        private void SetupLifecycleDiagnostics()
        {
            webView.CoreWebView2.ProcessFailed += (s, args) =>
            {
                Console.Error.WriteLine($"[CRITICAL] WebView2 process failed: {args.ProcessFailedKind}, reason: {args.Reason}, exit code: {args.ExitCode}");
                Debug.WriteLine($"[CRITICAL] WebView2 process failed: {args.ProcessFailedKind}, exit code: {args.ExitCode}");
            };

            webView.CoreWebView2.NavigationStarting += (s, args) =>
            {
                Console.WriteLine($"[Host Navigation] Starting navigation to: {args.Uri}");
                Debug.WriteLine($"[Host Navigation] Starting navigation to: {args.Uri}");
            };

            webView.CoreWebView2.NavigationCompleted += async (s, args) =>
            {
                if (args.IsSuccess)
                {
                    Console.WriteLine($"[Host Navigation] Navigation completed successfully. HTTP: {args.HttpStatusCode}");
                    Debug.WriteLine($"[Host Navigation] Completed successfully. HTTP: {args.HttpStatusCode}");
                    if (options.SmokeTest)
                    {
                        try
                        {
                            string runtime = await webView.CoreWebView2.ExecuteScriptAsync(
                                "Boolean(window.__TIZENTUBE_LOADER__ && window.__TIZENTUBE_LOADER__.adblock && window.__TIZENTUBE_LOADER__.adblock.options.enabled)");
                            string style = await webView.CoreWebView2.ExecuteScriptAsync(
                                "Boolean(document.getElementById('tizentube-adblock-styles'))");
                            if (runtime == "true") Interlocked.Exchange(ref adblockRuntimeObserved, 1);
                            if (style == "true") Interlocked.Exchange(ref adblockStyleObserved, 1);
                            Console.WriteLine($"[Host AdBlock Probe] runtime={runtime}, stylesheet={style}");
                        }
                        catch (Exception probeError)
                        {
                            Debug.WriteLine("[Host AdBlock Probe] " + probeError.Message);
                        }
                    }
                }
                else
                {
                    Console.Error.WriteLine($"[Host Navigation Error] WebErrorStatus: {args.WebErrorStatus}, HTTP: {args.HttpStatusCode}");
                    Debug.WriteLine($"[Host Navigation Error] WebErrorStatus: {args.WebErrorStatus}, HTTP: {args.HttpStatusCode}");
                }
            };
        }

        private void SetupNetworkAdBlocker()
        {
            // Intercept and drop ad network traffic at the protocol layer (Network-level AdBlock)
            webView.CoreWebView2.AddWebResourceRequestedFilter("*googleads*", CoreWebView2WebResourceContext.All);
            webView.CoreWebView2.AddWebResourceRequestedFilter("*doubleclick*", CoreWebView2WebResourceContext.All);
            webView.CoreWebView2.AddWebResourceRequestedFilter("*youtube.com/pagead/*", CoreWebView2WebResourceContext.All);
            webView.CoreWebView2.AddWebResourceRequestedFilter("*youtube.com/ptracking*", CoreWebView2WebResourceContext.All);
            webView.CoreWebView2.AddWebResourceRequestedFilter("*youtube.com/api/stats/ads*", CoreWebView2WebResourceContext.All);

            webView.CoreWebView2.WebResourceRequested += (s, args) =>
            {
                Interlocked.Increment(ref blockedAdCount);
                // Create an empty HTTP 204 No Content response to drop ad request
                var emptyResponse = webView.CoreWebView2.Environment.CreateWebResourceResponse(
                    null, 204, "No Content", "Content-Type: text/plain"
                );
                args.Response = emptyResponse;
            };
        }

        private void SetupFullscreenHandling()
        {
            // Synchronize native window borderless fullscreen when web player enters/exits fullscreen
            webView.CoreWebView2.ContainsFullScreenElementChanged += (s, args) =>
            {
                this.Invoke((MethodInvoker)delegate
                {
                    if (webView.CoreWebView2.ContainsFullScreenElement)
                    {
                        this.FormBorderStyle = FormBorderStyle.None;
                        this.WindowState = FormWindowState.Maximized;
                    }
                    else
                    {
                        this.FormBorderStyle = FormBorderStyle.Sizable;
                        this.WindowState = FormWindowState.Normal;
                    }
                });
            };
        }

        private void SetupIpcBridge()
        {
            // Bidirectional IPC between Host and Web client
            webView.CoreWebView2.WebMessageReceived += (s, args) =>
            {
                try
                {
                    string json = args.WebMessageAsJson;
                    if (string.IsNullOrEmpty(json)) return;

                    // Message dispatching for SponsorBlock skip notifications, memory requests, preferences, etc.
                    if (json.Contains("sponsorblock:skipped"))
                    {
                        Interlocked.Increment(ref sponsorBlockSkipCount);
                        Console.WriteLine("[Host IPC] SponsorBlock segment auto-skipped.");
                        Debug.WriteLine("[Host IPC] SponsorBlock segment auto-skipped.");
                    }
                    else if (json.Contains("mods:initialized"))
                    {
                        Interlocked.Increment(ref modsInitializedCount);
                        Console.WriteLine("[Host IPC] TizenTube mods bundle initialized successfully.");
                        Debug.WriteLine("[Host IPC] TizenTube mods bundle initialized.");
                    }
                    else if (json.Contains("memory:trim"))
                    {
                        Console.WriteLine("[Host IPC] Received memory:trim request from web context.");
                        TrimMemoryNow();
                    }
                    else if (json.Contains("fullscreen:toggle"))
                    {
                        Console.WriteLine("[Host IPC] Fullscreen toggle requested.");
                        this.Invoke((MethodInvoker)delegate { ToggleFullscreen(); });
                    }
                    else if (json.Contains("preferences:save"))
                    {
                        // Persist user preferences to local JSON on Windows disk
                        try
                        {
                            string prefsPath = Path.Combine(appDataDir, "user_preferences.json");
                            File.WriteAllText(prefsPath, json);
                            Console.WriteLine("[Host IPC] Preferences persisted to: " + prefsPath);
                            Debug.WriteLine("[Host IPC] Preferences persisted to: " + prefsPath);
                        }
                        catch (Exception ex)
                        {
                            Console.Error.WriteLine("[Host IPC Prefs Error] " + ex.Message);
                            Debug.WriteLine("[Host IPC Prefs Error] " + ex.Message);
                        }
                    }
                    else if (json.Contains("fullscreen:state"))
                    {
                        // Update window borderless fullscreen if requested from JS
                        bool isFs = json.Contains("\"isFullscreen\":true");
                        Console.WriteLine($"[Host IPC] Fullscreen state updated: isFullscreen={isFs}");
                        this.Invoke((MethodInvoker)delegate
                        {
                            if (isFs)
                            {
                                this.FormBorderStyle = FormBorderStyle.None;
                                this.WindowState = FormWindowState.Maximized;
                            }
                            else
                            {
                                this.FormBorderStyle = FormBorderStyle.Sizable;
                                this.WindowState = FormWindowState.Normal;
                            }
                        });
                    }
                    else if (json.Contains("telemetry:request"))
                    {
                        // Expose live process telemetry to web layer upon request
                        string telemetryJson = CollectTelemetryJson("ipc-query");
                        webView?.CoreWebView2?.PostWebMessageAsJson("{\"channel\":\"telemetry:response\",\"payload\":" + telemetryJson + "}");
                    }
                }
                catch (Exception ex)
                {
                    Debug.WriteLine("[Host IPC Error] " + ex.Message);
                }
            };
        }

        private async Task InjectModsAsync()
        {
            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            string appDir = Path.Combine(baseDir, "app");
            if (!Directory.Exists(appDir))
            {
                if (Directory.Exists(Path.Combine(baseDir, "..", "app")))
                    appDir = Path.GetFullPath(Path.Combine(baseDir, "..", "app"));
                else if (Directory.Exists(Path.Combine(baseDir, "..", "..", "..", "src")))
                    appDir = Path.GetFullPath(Path.Combine(baseDir, "..", "..", "..", "src"));
            }

            string bundlePath = Path.Combine(appDir, "mods", "tizentube.bundle.js");
            string legacyPath = Path.Combine(appDir, "mods", "mod_loader.js");
            string stylesPath = Path.Combine(appDir, "ui", "styles.css");
            string scriptContent = "";

            // 1. Inject custom HUD/controls CSS stylesheet into page
            if (File.Exists(stylesPath))
            {
                string css = File.ReadAllText(stylesPath).Replace("\r", "").Replace("\n", " ").Replace("\"", "\\\"");
                string injectCssScript = $"(() => {{ const s = document.createElement('style'); s.id = 'tizentube-ui-styles'; s.textContent = \"{css}\"; (document.head || document.documentElement).appendChild(s); }})();";
                await webView.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(injectCssScript);
            }

            // 2. Inject initial persisted preferences if available on host disk
            string prefsPath = Path.Combine(appDataDir, "user_preferences.json");
            if (File.Exists(prefsPath))
            {
                try
                {
                    string prefsJson = File.ReadAllText(prefsPath).Trim();
                    if (!string.IsNullOrEmpty(prefsJson))
                    {
                        string initScript = $"window.__TIZENTUBE_INITIAL_PREFERENCES__ = {prefsJson};";
                        await webView.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(initScript);
                    }
                }
                catch { }
            }

            // 3. Inject standalone IIFE bundle (AdBlock, SponsorBlock, DeArrow, PlaybackEngine, UI)
            if (File.Exists(bundlePath))
            {
                scriptContent = File.ReadAllText(bundlePath);
            }
            else if (File.Exists(legacyPath))
            {
                scriptContent = File.ReadAllText(legacyPath);
            }
            else
            {
                // Fallback inline basic JSON.parse hook if bundle is missing
                scriptContent = @"
                    (function() {
                        const originalParse = JSON.parse;
                        JSON.parse = function(...args) {
                            const res = originalParse.apply(this, args);
                            if (res && typeof res === 'object') {
                                delete res.adPlacements;
                                delete res.playerAds;
                                delete res.adSlots;
                                if (res.playerResponse && typeof res.playerResponse === 'object') {
                                    delete res.playerResponse.adPlacements;
                                    delete res.playerResponse.playerAds;
                                    delete res.playerResponse.adSlots;
                                }
                            }
                            return res;
                        };
                    })();
                ";
            }

            await webView.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(scriptContent);
        }

        private void SetupMemoryTrimming()
        {
            // Trims process working set periodically (every 30 seconds)
            // NOTE: EmptyWorkingSet unmaps physical RAM pages to the Windows paging file,
            // lowering Working Set metrics during idle or minimized states. Real private bytes
            // reduction is achieved via single-renderer process limits, cache limits, and mod cache flushes.
            memoryTrimTimer = new System.Windows.Forms.Timer { Interval = 30000 };
            memoryTrimTimer.Tick += (s, e) => TrimMemoryNow();
            memoryTrimTimer.Start();
        }

        public void TrimMemoryNow()
        {
            try
            {
                Interlocked.Increment(ref trimCount);

                // 1. Dispatch IPC message to web client so JS flushes SponsorBlock/DeArrow LRU caches
                try
                {
                    webView?.CoreWebView2?.PostWebMessageAsJson("{\"channel\":\"memory:trim\",\"payload\":{}}");
                }
                catch { }

                // 2. Trim host process working set
                EmptyWorkingSet(Process.GetCurrentProcess().Handle);

                // 3. Trim child WebView2 processes (browser, renderer, gpu)
                foreach (var proc in Process.GetProcessesByName("msedgewebview2"))
                {
                    try
                    {
                        EmptyWorkingSet(proc.Handle);
                    }
                    catch { }
                }
            }
            catch { }
        }

        private void SetupSmokeTestTimer()
        {
            smokeTestTimer = new System.Windows.Forms.Timer
            {
                Interval = Math.Max(1000, options.SmokeTestDurationSeconds * 1000)
            };
            smokeTestTimer.Tick += (s, e) =>
            {
                smokeTestTimer.Stop();
                DumpTelemetryReport("smoke-test-completed");
                this.Close();
            };
            smokeTestTimer.Start();
        }

        public string CollectTelemetryJson(string scenario = "standard")
        {
            var hostProc = Process.GetCurrentProcess();
            hostProc.Refresh();

            long hostWs = hostProc.WorkingSet64;
            long hostPrivate = hostProc.PrivateMemorySize64;
            long hostPeakWs = hostProc.PeakWorkingSet64;
            double hostCpuMs = hostProc.TotalProcessorTime.TotalMilliseconds;

            long totalWs = hostWs;
            long totalPrivate = hostPrivate;

            var inv = CultureInfo.InvariantCulture;

            var processList = new StringBuilder();
            processList.Append($"        {{\"pid\": {hostProc.Id}, \"name\": \"{EscapeJson(hostProc.ProcessName)}\", \"role\": \"host\", \"workingSetBytes\": {hostWs}, \"workingSetMb\": {Math.Round(hostWs / (1024.0 * 1024.0), 2).ToString(inv)}, \"privateMemoryBytes\": {hostPrivate}, \"privateMemoryMb\": {Math.Round(hostPrivate / (1024.0 * 1024.0), 2).ToString(inv)}, \"peakWorkingSetBytes\": {hostPeakWs}, \"peakWorkingSetMb\": {Math.Round(hostPeakWs / (1024.0 * 1024.0), 2).ToString(inv)}, \"cpuTimeMs\": {Math.Round(hostCpuMs, 1).ToString(inv)}}}");

            int childCount = 0;
            foreach (var proc in Process.GetProcessesByName("msedgewebview2"))
            {
                try
                {
                    proc.Refresh();
                    long cWs = proc.WorkingSet64;
                    long cPrivate = proc.PrivateMemorySize64;
                    long cPeakWs = proc.PeakWorkingSet64;
                    double cCpuMs = 0;
                    try { cCpuMs = proc.TotalProcessorTime.TotalMilliseconds; } catch { }

                    totalWs += cWs;
                    totalPrivate += cPrivate;
                    childCount++;

                    processList.Append($",\n        {{\"pid\": {proc.Id}, \"name\": \"{EscapeJson(proc.ProcessName)}\", \"role\": \"webview2-subsystem\", \"workingSetBytes\": {cWs}, \"workingSetMb\": {Math.Round(cWs / (1024.0 * 1024.0), 2).ToString(inv)}, \"privateMemoryBytes\": {cPrivate}, \"privateMemoryMb\": {Math.Round(cPrivate / (1024.0 * 1024.0), 2).ToString(inv)}, \"peakWorkingSetBytes\": {cPeakWs}, \"peakWorkingSetMb\": {Math.Round(cPeakWs / (1024.0 * 1024.0), 2).ToString(inv)}, \"cpuTimeMs\": {Math.Round(cCpuMs, 1).ToString(inv)}}}");
                }
                catch { }
            }

            double totalWsMb = Math.Round(totalWs / (1024.0 * 1024.0), 2);
            double totalPrivMb = Math.Round(totalPrivate / (1024.0 * 1024.0), 2);
            double durationSec = Math.Round((DateTime.UtcNow - startTimeUtc).TotalSeconds, 2);

            var sb = new StringBuilder();
            sb.AppendLine("{");
            sb.AppendLine($"  \"timestamp\": \"{DateTime.UtcNow:O}\",");
            sb.AppendLine($"  \"scenario\": \"{EscapeJson(scenario)}\",");
            sb.AppendLine($"  \"durationSeconds\": {durationSec.ToString(inv)},");
            sb.AppendLine("  \"summary\": {");
            sb.AppendLine($"    \"totalWorkingSetBytes\": {totalWs},");
            sb.AppendLine($"    \"totalWorkingSetMb\": {totalWsMb.ToString(inv)},");
            sb.AppendLine($"    \"totalPrivateMemoryBytes\": {totalPrivate},");
            sb.AppendLine($"    \"totalPrivateMemoryMb\": {totalPrivMb.ToString(inv)},");
            sb.AppendLine($"    \"processCount\": {1 + childCount},");
            sb.AppendLine($"    \"blockedAdRequests\": {Interlocked.Read(ref blockedAdCount)},");
            sb.AppendLine($"    \"emptyWorkingSetTrimCount\": {Interlocked.Read(ref trimCount)},");
            sb.AppendLine($"    \"modsInitializedCount\": {Interlocked.Read(ref modsInitializedCount)},");
            sb.AppendLine($"    \"adblockRuntimeObserved\": {Interlocked.Read(ref adblockRuntimeObserved)},");
            sb.AppendLine($"    \"adblockStyleObserved\": {Interlocked.Read(ref adblockStyleObserved)},");
            sb.AppendLine($"    \"sponsorBlockSkipCount\": {Interlocked.Read(ref sponsorBlockSkipCount)}");
            sb.AppendLine("  },");
            sb.AppendLine("  \"processes\": [");
            sb.AppendLine(processList.ToString());
            sb.AppendLine("  ]");
            sb.Append("}");

            return sb.ToString();
        }

        private void DumpTelemetryReport(string scenario)
        {
            string json = CollectTelemetryJson(scenario);
            Console.WriteLine("\n==================================================");
            Console.WriteLine("  TizenTube Windows - Host Telemetry Report");
            Console.WriteLine("==================================================");
            Console.WriteLine(json);

            if (!string.IsNullOrEmpty(options.TelemetryFilePath))
            {
                try
                {
                    string dir = Path.GetDirectoryName(Path.GetFullPath(options.TelemetryFilePath));
                    if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
                    {
                        Directory.CreateDirectory(dir);
                    }
                    File.WriteAllText(options.TelemetryFilePath, json, Encoding.UTF8);
                    Console.WriteLine($"[OK] Telemetry written to: {options.TelemetryFilePath}");
                }
                catch (Exception ex)
                {
                    Console.Error.WriteLine($"[ERROR] Failed to write telemetry file: {ex.Message}");
                }
            }
        }

        private static string EscapeJson(string str)
        {
            if (string.IsNullOrEmpty(str)) return "";
            return str.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\r", "").Replace("\n", "");
        }

        protected override bool ProcessCmdKey(ref Message msg, Keys keyData)
        {
            if (keyData == Keys.F11)
            {
                ToggleFullscreen();
                return true;
            }
            if (keyData == Keys.F2 || keyData == (Keys.Control | Keys.Oemcomma))
            {
                webView?.CoreWebView2?.ExecuteScriptAsync("window.__TIZENTUBE_LOADER__?.ui?.settingsModal?.open();");
                return true;
            }
            return base.ProcessCmdKey(ref msg, keyData);
        }

        private void ToggleFullscreen()
        {
            if (this.FormBorderStyle == FormBorderStyle.None)
            {
                this.FormBorderStyle = FormBorderStyle.Sizable;
                this.WindowState = FormWindowState.Normal;
            }
            else
            {
                this.FormBorderStyle = FormBorderStyle.None;
                this.WindowState = FormWindowState.Maximized;
            }
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            memoryTrimTimer?.Stop();
            memoryTrimTimer?.Dispose();
            smokeTestTimer?.Stop();
            smokeTestTimer?.Dispose();
            webView?.Dispose();
            base.OnFormClosing(e);
        }
    }
}
