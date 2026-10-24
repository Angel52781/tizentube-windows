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
        public bool DiagnoseAdsOnStartup { get; set; } = false;
        public bool TvMode { get; set; } = false;
        public bool WindowCycleTest { get; set; } = false;
        public bool FloatingWindowTest { get; set; } = false;
        public bool WindowPlacementTest { get; set; } = false;
        public bool FloatingHotKeyTest { get; set; } = false;
        public bool FloatingVisualProbe { get; set; } = false;
        public bool TheaterUserProbe { get; set; } = false;
        public bool TheaterRestoreProbe { get; set; } = false;

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
                else if (arg == "--tv")
                {
                    options.TvMode = true;
                    options.InitialUrl = "https://www.youtube.com/tv";
                }
                else if (arg == "--diagnose-ads")
                {
                    // Opt-in and metadata-only; never capture auth/cookies.
                    options.DiagnoseAdsOnStartup = true;
                }
                else if (arg == "--window-cycle-test")
                {
                    options.WindowCycleTest = true;
                }
                else if (arg == "--floating-window-test")
                {
                    options.FloatingWindowTest = true;
                }
                else if (arg == "--window-placement-test")
                {
                    options.WindowPlacementTest = true;
                }
                else if (arg == "--floating-hotkey-test")
                {
                    options.FloatingHotKeyTest = true;
                }
                else if (arg == "--floating-visual-probe")
                {
                    options.FloatingVisualProbe = true;
                }
                else if (arg == "--theater-user-probe")
                {
                    options.TheaterUserProbe = true;
                }
                else if (arg == "--theater-restore-probe")
                {
                    options.TheaterRestoreProbe = true;
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
            Console.WriteLine("  --tv                  Experimental YouTube TV UI (Cobalt-like); separate profile");
            Console.WriteLine("  --diagnose-ads        Save a local, metadata-only ad structure report on first load");
            Console.WriteLine("  --window-cycle-test   Test borderless fullscreen and native window restoration");
            Console.WriteLine("  --floating-window-test  Verify Windows topmost floating window and restore");
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

#if NET8_0_OR_GREATER
            // WebView2 needs DPI awareness for sharp text on 125/150/200%
            // displays and when moving across monitors with different scales.
            // Configure before any HWND is created to prevent bitmap scaling.
            Application.SetHighDpiMode(HighDpiMode.PerMonitorV2);
#endif
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

        // Register only while TizenTube has focus: Chromium handles
        // Ctrl+Shift+P as Print before WinForms KeyDown/ProcessCmdKey fires.
        // WM_HOTKEY is delivered by Windows before WebView2 can print.
        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool RegisterHotKey(IntPtr window, int id, uint modifiers, uint virtualKey);
        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool UnregisterHotKey(IntPtr window, int id);
        private const int WmHotKey = 0x0312;
        private const int FloatingHotKeyId = 0x54A1;
        private const uint ModControlShiftNoRepeat = 0x4000 | 0x0002 | 0x0004;
        private bool floatingHotKeyRegistered = false;
        private long floatingHotKeyWindowsTriggered = 0;

        private readonly HostOptions options;
        private WebView2 webView;
        private System.Windows.Forms.Timer memoryTrimTimer;
        private System.Windows.Forms.Timer smokeTestTimer;
        private string appDataDir;
        private string theaterPreferenceFile;
        private bool theaterRestoreInProgress = false;
        private DateTime lastTheaterRestoreAttemptUtc = DateTime.MinValue;
        private long nativeTheaterRestored = 0;
        private bool floatingVisualProbeStarted = false;
        private bool theaterProbeStarted = false;
        private long blockedAdCount = 0;
        private long trimCount = 0;
        private long modsInitializedCount = 0;
        private long sponsorBlockSkipCount = 0;
        // Independent check that document-start cosmetic filtering actually
        // reaches a loaded WebView2 DOM (not merely bundled at compile time).
        private long adblockStyleObserved = 0;
        private long adblockRuntimeObserved = 0;
        private bool initialAdDiagnosticQueued = false;
        private bool manualImmersiveMode = false;
        private bool webPlayerFullscreen = false;
        private bool nativeImmersiveActive = false;
        private Rectangle boundsBeforeFullscreen;
        private FormWindowState stateBeforeFullscreen;
        private FormBorderStyle borderBeforeFullscreen;
        private bool topMostBeforeFullscreen;
        private long windowCyclePass = 0;
        private long windowFullMonitorPass = 0;
        private long windowRestorePass = 0;
        private bool nativeFloatingActive = false;
        private Rectangle boundsBeforeFloating;
        private FormWindowState stateBeforeFloating;
        private FormBorderStyle borderBeforeFloating;
        private Size minimumBeforeFloating;
        private bool topMostBeforeFloating;
        private long floatingWindowCyclePass = 0;
        private long floatingAcceleratorHandled = 0;
        private bool floatingAcceleratorDown = false;
        private string windowPlacementFile;
        private Rectangle lastNormalBounds;
        private bool lastWindowWasMaximized;
        private long windowPlacementRestored = 0;
        private DateTime startTimeUtc = DateTime.UtcNow;

        public int ExitCode { get; private set; } = 0;

        public MainWindow(HostOptions options)
        {
            this.options = options ?? new HostOptions();

            this.AutoScaleMode = AutoScaleMode.Dpi;
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
                "TizenTube", this.options.TvMode ? "TVUserData" : "UserData"
            );
            Directory.CreateDirectory(appDataDir);
            theaterPreferenceFile = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "TizenTube", this.options.TvMode ? "tv-theater-preference.json" : "theater-preference.json");
            // Window layout is independent of WebView2's Google login data.
            windowPlacementFile = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "TizenTube", this.options.TvMode ? "tv-window-placement.json" : "window-placement.json");
            if (this.options.WindowPlacementTest &&
                !string.IsNullOrEmpty(Environment.GetEnvironmentVariable("TIZENTUBE_TEST_PLACEMENT_DIR")))
            {
                string isolated = Environment.GetEnvironmentVariable("TIZENTUBE_TEST_PLACEMENT_DIR");
                Directory.CreateDirectory(isolated);
                windowPlacementFile = Path.Combine(isolated, "window-placement.json");
            }
            RestoreWindowPlacement();

            this.ResizeEnd += (s, e) => RememberWindowPlacement();
            this.Move += (s, e) => RememberWindowPlacement();
            this.Resize += (s, e) => RememberWindowPlacement();
            this.Activated += (s, e) => EnableFocusedFloatingHotkey();
            this.Deactivate += (s, e) => DisableFocusedFloatingHotkey();

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

            if (this.options.WindowCycleTest && !this.options.HeadlessMode)
            {
                this.Shown += (sender, evt) => BeginInvoke((MethodInvoker)delegate {
                    var beforeBounds = this.Bounds;
                    var beforeState = this.WindowState;
                    var beforeBorder = this.FormBorderStyle;
                    manualImmersiveMode = true;
                    UpdateNativeImmersiveMode();
                    bool fullscreenCoversScreen = this.Bounds == Screen.FromControl(this).Bounds &&
                        this.FormBorderStyle == FormBorderStyle.None && this.TopMost;
                    manualImmersiveMode = false;
                    UpdateNativeImmersiveMode();
                    bool restored = this.Bounds == beforeBounds &&
                        this.WindowState == beforeState && this.FormBorderStyle == beforeBorder &&
                        !this.TopMost;
                    if (fullscreenCoversScreen) Interlocked.Exchange(ref windowFullMonitorPass, 1);
                    if (restored) Interlocked.Exchange(ref windowRestorePass, 1);
                    if (fullscreenCoversScreen && restored) Interlocked.Exchange(ref windowCyclePass, 1);
                    else this.ExitCode = 3;
                    Console.WriteLine($"[Host Immersive Test] screen={fullscreenCoversScreen} restore={restored}");
                });
            }
            if (this.options.WindowPlacementTest && !this.options.HeadlessMode)
            {
                this.Shown += (sender, evt) => BeginInvoke((MethodInvoker)delegate {
                    if (Interlocked.Read(ref windowPlacementRestored) == 0)
                    {
                        WindowState = FormWindowState.Normal;
                        var monitor = Screen.FromControl(this).WorkingArea;
                        Bounds = new Rectangle(monitor.X + 40, monitor.Y + 40, 900, 560);
                        RememberWindowPlacement();
                        WindowState = FormWindowState.Maximized;
                        RememberWindowPlacement();
                    }
                });
            }
            if (this.options.FloatingHotKeyTest && !this.options.HeadlessMode)
            {
                this.Shown += async (sender, evt) => {
                    await Task.Delay(3000);
                    if (IsDisposed) return;
                    Activate();
                    // This sends the SAME keyboard combination as the user.
                    // The test must fail if Windows/WebView2 does not deliver
                    // WM_HOTKEY, rather than merely detecting a loaded UI.
                    SendKeys.SendWait("^+p");
                    await Task.Delay(900);
                    bool reached = Interlocked.Read(ref floatingHotKeyWindowsTriggered) > 0;
                    if (!reached) ExitCode = 5;
                    Console.WriteLine($"[Host Hotkey Test] windowsHotkey={reached}");
                };
            }

            if (this.options.FloatingWindowTest && !this.options.HeadlessMode)
            {
                this.Shown += (sender, evt) => BeginInvoke((MethodInvoker)delegate {
                    var bounds = Bounds;
                    var state = WindowState;
                    var border = FormBorderStyle;
                    var min = MinimumSize;
                    var top = TopMost;
                    SetNativeFloatingWindow(true);
                    bool floated = nativeFloatingActive && TopMost &&
                        Bounds.Width <= 620 && Bounds.Height <= 460 && MinimumSize.Width <= 350;
                    SetNativeFloatingWindow(false);
                    bool restored = !nativeFloatingActive && Bounds == bounds &&
                        WindowState == state && FormBorderStyle == border &&
                        MinimumSize == min && TopMost == top;
                    if (floated && restored) Interlocked.Exchange(ref floatingWindowCyclePass, 1);
                    else ExitCode = 4;
                    Console.WriteLine($"[Host Floating Test] float={floated} restore={restored}");
                });
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
                    // Allow Chromium to throttle idle/background tabs: no
                    // background video should force a renderer to busy-loop.
                    "--enable-gpu-rasterization " +
                    "--enable-zero-copy";

                var envOptions = new CoreWebView2EnvironmentOptions(chromiumArgs);
                var env = await CoreWebView2Environment.CreateAsync(null, appDataDir, envOptions);
                await webView.EnsureCoreWebView2Async(env);

                ConfigureWebViewSettings();
                SetupFloatingAccelerators();
                SetupLifecycleDiagnostics();
                SetupNetworkAdBlocker();
                SetupFullscreenHandling();
                SetupIpcBridge();
                SetupAdblockDiagnosticMenu();
                await InjectModsAsync();

                if (options.FloatingVisualProbe)
                {
                    webView.CoreWebView2.NavigationCompleted += async (sender, nav) =>
                    {
                        if (!nav.IsSuccess || floatingVisualProbeStarted || IsDisposed) return;
                        floatingVisualProbeStarted = true;
                        await CaptureFloatingVisualProbeAsync();
                    };
                }
                if (options.TheaterUserProbe || options.TheaterRestoreProbe)
                {
                    webView.CoreWebView2.NavigationCompleted += async (sender, nav) =>
                    {
                        if (!nav.IsSuccess || theaterProbeStarted || IsDisposed) return;
                        theaterProbeStarted = true;
                        await CaptureTheaterProbeAsync();
                    };
                }

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
            if (options.TvMode)
            {
                // Experimental parity path with reisxd/TizenTubeCobalt. Uses
                // the TV client and one of the upstream-generated Cobalt UAs.
                // Do not apply it to desktop browsing or the user's existing
                // Google session. TV compatibility is not guaranteed.
                settings.UserAgent = "Mozilla/5.0 (Linux armeabi-v7a; Android 14) " +
                    "Cobalt/25.lts.30.1034958-gold (unlike Gecko) " +
                    "v8/8.8.278.17-jit gles Starboard/15, " +
                    "Google_ATV_sabrina_2020/UTTC.250917.004 (google, Chromecast) " +
                    "com.google.android.youtube.tv/5.30.301";
            }
            settings.AreDefaultContextMenusEnabled = true;
            settings.AreDevToolsEnabled = false; // Disabled by default in production to save RAM
            settings.IsStatusBarEnabled = false;
            settings.IsZoomControlEnabled = false;
        }

        private void SetupFloatingAccelerators()
        {
            // WebView2.WinForms exposes browser accelerator keys through the
            // WinForms control KeyDown (not a public CoreWebView2Controller).
            // Handled prevents Chromium's Ctrl+Shift+P printing action.
            webView.KeyDown += (sender, e) =>
            {
                bool shortcut = e.KeyCode == Keys.P && e.Control && e.Shift;
                bool f9 = e.KeyCode == Keys.F9;
                if (!shortcut && !f9) return;
                e.Handled = true;
                e.SuppressKeyPress = true;
                if (floatingAcceleratorDown) return;
                floatingAcceleratorDown = true;
                Interlocked.Increment(ref floatingAcceleratorHandled);
                if (IsHandleCreated && !IsDisposed)
                    BeginInvoke((MethodInvoker)delegate { _ = ToggleFloatingWindowAsync(); });
            };
            webView.KeyUp += (sender, e) => {
                if (e.KeyCode == Keys.P || e.KeyCode == Keys.F9 ||
                    e.KeyCode == Keys.ControlKey || e.KeyCode == Keys.ShiftKey)
                    floatingAcceleratorDown = false;
            };
        }

        private void EnableFocusedFloatingHotkey()
        {
            if (floatingHotKeyRegistered || !IsHandleCreated || options.HeadlessMode) return;
            floatingHotKeyRegistered = RegisterHotKey(Handle, FloatingHotKeyId,
                ModControlShiftNoRepeat, (uint)Keys.P);
            if (!floatingHotKeyRegistered)
                Debug.WriteLine("Windows Ctrl+Shift+P hotkey unavailable; use F9 or the PiP button.");
        }

        private void DisableFocusedFloatingHotkey()
        {
            if (!floatingHotKeyRegistered || !IsHandleCreated) return;
            UnregisterHotKey(Handle, FloatingHotKeyId);
            floatingHotKeyRegistered = false;
        }

        protected override void WndProc(ref Message m)
        {
            if (m.Msg == WmHotKey && m.WParam.ToInt32() == FloatingHotKeyId)
            {
                Interlocked.Increment(ref floatingHotKeyWindowsTriggered);
                _ = ToggleFloatingWindowAsync();
                return;
            }
            base.WndProc(ref m);
        }

        private void RememberWindowPlacement()
        {
            if (nativeFloatingActive || nativeImmersiveActive || options.HeadlessMode ||
                !IsHandleCreated || WindowState == FormWindowState.Minimized) return;
            if (WindowState == FormWindowState.Normal && Bounds.Width >= 800 && Bounds.Height >= 500)
                lastNormalBounds = Bounds;
            lastWindowWasMaximized = WindowState == FormWindowState.Maximized;
        }

        private void RestoreWindowPlacement()
        {
            try
            {
                if (!File.Exists(windowPlacementFile)) return;
                using (var json = System.Text.Json.JsonDocument.Parse(File.ReadAllText(windowPlacementFile)))
                {
                    var root = json.RootElement;
                    var placement = new Rectangle(root.GetProperty("x").GetInt32(),
                        root.GetProperty("y").GetInt32(), root.GetProperty("width").GetInt32(),
                        root.GetProperty("height").GetInt32());
                    if (placement.Width < 800 || placement.Height < 500 ||
                        placement.Width > 10000 || placement.Height > 10000 ||
                        !Array.Exists(Screen.AllScreens, s => s.WorkingArea.IntersectsWith(placement)))
                        return; // Detached monitor: keep safe, centered defaults.
                    StartPosition = FormStartPosition.Manual;
                    Bounds = placement;
                    lastNormalBounds = placement;
                    if (root.GetProperty("maximized").GetBoolean())
                    {
                        WindowState = FormWindowState.Maximized;
                        lastWindowWasMaximized = true;
                    }
                    Interlocked.Exchange(ref windowPlacementRestored, 1);
                }
            }
            catch (Exception e) { Debug.WriteLine("Window placement restore: " + e.Message); }
        }

        private void SaveWindowPlacement()
        {
            if (options.HeadlessMode) return;
            try
            {
                Rectangle normal = lastNormalBounds.Width >= 800 && lastNormalBounds.Height >= 500
                    ? lastNormalBounds : (WindowState == FormWindowState.Normal ? Bounds : RestoreBounds);
                if (normal.Width < 800 || normal.Height < 500) return;
                bool maximized = WindowState == FormWindowState.Maximized ||
                    (WindowState == FormWindowState.Minimized && lastWindowWasMaximized);
                var value = new { x = normal.X, y = normal.Y,
                    width = normal.Width, height = normal.Height, maximized };
                string target = windowPlacementFile + ".tmp";
                File.WriteAllText(target, System.Text.Json.JsonSerializer.Serialize(value));
                File.Move(target, windowPlacementFile, true);
            }
            catch (Exception e) { Debug.WriteLine("Window placement save: " + e.Message); }
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
                    if (options.DiagnoseAdsOnStartup && !initialAdDiagnosticQueued)
                    {
                        initialAdDiagnosticQueued = true;
                        _ = CaptureInitialAdDiagnosticAsync();
                    }
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

        private async Task CaptureInitialAdDiagnosticAsync()
        {
            // Wait for YouTube's asynchronous home feed to appear; this is
            // only enabled with --diagnose-ads and sends metadata to the
            // existing local-only handler (no external network requests).
            await Task.Delay(4500);
            await RequestAdDiagnosticAsync();
        }

        private async Task RequestAdDiagnosticAsync()
        {
            if (webView?.CoreWebView2 == null) return;
            try
            {
                await webView.CoreWebView2.ExecuteScriptAsync(
                    "(() => { const ad = window.__TIZENTUBE_LOADER__?.adblock; " +
                    "if (ad && ad.collectSponsoredDiagnostics) " +
                    "window.chrome.webview.postMessage({ channel: 'adblock:diagnostic', " +
                    "payload: ad.collectSponsoredDiagnostics() }); })();");
            }
            catch (Exception e) { Debug.WriteLine("Ad diagnostic error: " + e.Message); }
        }

        private void SetupAdblockDiagnosticMenu()
        {
            // Native right-click menu does not rely on YouTube consuming a
            // Ctrl+Shift+F10 keyboard shortcut. User controls whether to
            // collect and share the report.
            webView.CoreWebView2.ContextMenuRequested += (s, e) =>
            {
                var menu = webView.CoreWebView2.Environment.CreateContextMenuItem(
                    "TizenTube: diagnosticar anuncios", null,
                    CoreWebView2ContextMenuItemKind.Command);
                menu.CustomItemSelected += async (sender, args) => await RequestAdDiagnosticAsync();
                e.MenuItems.Add(menu);
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
            // Single native source of truth for web player fullscreen.
            // Older builds also reacted to fullscreen:state IPC and reset
            // WindowState twice, often restoring a minimized/small window.
            webView.CoreWebView2.ContainsFullScreenElementChanged += (s, args) =>
            {
                if (IsDisposed || !IsHandleCreated) return;
                BeginInvoke((MethodInvoker)delegate {
                    webPlayerFullscreen = webView.CoreWebView2.ContainsFullScreenElement;
                    UpdateNativeImmersiveMode();
                });
            };
        }

        private void UpdateNativeImmersiveMode()
        {
            if (options.HeadlessMode) return;
            if (nativeFloatingActive && (manualImmersiveMode || webPlayerFullscreen))
            {
                SetNativeFloatingWindow(false);
                _ = webView?.CoreWebView2?.ExecuteScriptAsync(
                    "document.documentElement.classList.remove('tt-floating-mode');" +
                    "document.getElementById('tizentube-native-pip')?.setAttribute('aria-pressed','false');");
            }
            bool shouldBeFullscreen = manualImmersiveMode || webPlayerFullscreen;
            if (shouldBeFullscreen == nativeImmersiveActive) return;
            if (shouldBeFullscreen)
            {
                // A maximized borderless WinForms window may use *work area*
                // bounds and leave the taskbar visible. Use full Screen.Bounds.
                boundsBeforeFullscreen = this.WindowState == FormWindowState.Normal
                    ? this.Bounds : this.RestoreBounds;
                stateBeforeFullscreen = this.WindowState;
                borderBeforeFullscreen = this.FormBorderStyle;
                topMostBeforeFullscreen = this.TopMost;
                nativeImmersiveActive = true;
                this.SuspendLayout();
                this.WindowState = FormWindowState.Normal;
                this.FormBorderStyle = FormBorderStyle.None;
                this.Bounds = Screen.FromControl(this).Bounds;
                this.TopMost = true;
                this.ResumeLayout();
            }
            else
            {
                nativeImmersiveActive = false;
                this.SuspendLayout();
                this.TopMost = topMostBeforeFullscreen;
                this.FormBorderStyle = borderBeforeFullscreen;
                this.WindowState = FormWindowState.Normal;
                if (boundsBeforeFullscreen.Width > 0 && boundsBeforeFullscreen.Height > 0)
                    this.Bounds = boundsBeforeFullscreen;
                if (stateBeforeFullscreen == FormWindowState.Maximized)
                    this.WindowState = FormWindowState.Maximized;
                // Do not restore Minimized: a user exiting video fullscreen
                // should always see a usable window.
                this.ResumeLayout();
            }
        }

        // WebView2 may not expose the browser PiP API. Rather than creating
        // another WebView (duplicate playback, re-login, higher RAM), float
        // the SAME native window and WebView at a video-sized resolution.
        // The original Youtube video node, stream and WebView session remain.
        private void SetNativeFloatingWindow(bool enable)
        {
            if (options.HeadlessMode || enable == nativeFloatingActive) return;
            SuspendLayout();
            try
            {
                if (enable)
                {
                    if (nativeImmersiveActive) return;
                    boundsBeforeFloating = WindowState == FormWindowState.Normal ? Bounds : RestoreBounds;
                    stateBeforeFloating = WindowState;
                    borderBeforeFloating = FormBorderStyle;
                    minimumBeforeFloating = MinimumSize;
                    topMostBeforeFloating = TopMost;
                    nativeFloatingActive = true;
                    WindowState = FormWindowState.Normal;
                    MinimumSize = new Size(320, 220);
                    FormBorderStyle = FormBorderStyle.SizableToolWindow;
                    Text = "TizenTube · Reproductor flotante";
                    var area = Screen.FromControl(this).WorkingArea;
                    int w = Math.Min(500, Math.Max(330, area.Width - 35));
                    int h = (int)Math.Round(w * 9.0 / 16.0) + 36;
                    Bounds = new Rectangle(area.Right - w - 22,
                        area.Bottom - h - 22, w, h);
                    TopMost = true;
                    Activate();
                }
                else
                {
                    nativeFloatingActive = false;
                    TopMost = topMostBeforeFloating;
                    FormBorderStyle = borderBeforeFloating;
                    MinimumSize = minimumBeforeFloating;
                    WindowState = FormWindowState.Normal;
                    if (boundsBeforeFloating.Width > 0 && boundsBeforeFloating.Height > 0)
                        Bounds = boundsBeforeFloating;
                    if (stateBeforeFloating == FormWindowState.Maximized)
                        WindowState = FormWindowState.Maximized;
                    Text = "TizenTube";
                }
            }
            finally { ResumeLayout(); }
        }

        private async Task CaptureFloatingVisualProbeAsync()
        {
            // Developer-only local functional probe (never sent to GitHub).
            // Screenshots can contain personal account information; the caller
            // is responsible for keeping them on the owner's computer.
            try
            {
                await Task.Delay(14000); // YouTube SPA/player can initialize late.
                if (IsDisposed || webView?.CoreWebView2 == null) return;
                string folder = Path.GetDirectoryName(options.TelemetryFilePath ?? "");
                if (string.IsNullOrEmpty(folder)) folder = appDataDir;
                Directory.CreateDirectory(folder);
                string before = await webView.CoreWebView2.ExecuteScriptAsync(
                    "window.__ttFloating?.diagnostics() || null");
                File.WriteAllText(Path.Combine(folder, "floating-before.json"), before);
                await ToggleFloatingWindowAsync();
                await Task.Delay(2300);
                string after = await webView.CoreWebView2.ExecuteScriptAsync(
                    "window.__ttFloating?.diagnostics() || null");
                File.WriteAllText(Path.Combine(folder, "floating-after.json"), after);
                using (var stream = File.Create(Path.Combine(folder, "floating-preview.png")))
                    await webView.CoreWebView2.CapturePreviewAsync(
                        CoreWebView2CapturePreviewImageFormat.Png, stream);
                Console.WriteLine("[Host PiP] Local screenshot and media layout probe saved");
                await ToggleFloatingWindowAsync(true);
            }
            catch (Exception ex) { Console.Error.WriteLine("[Host PiP Probe] " + ex.Message); }
        }

        private async Task CaptureTheaterProbeAsync()
        {
            // Local-only functional test: real WebView2 CDP mouse click,
            // rather than element.click() (which has isTrusted=false).
            try
            {
                await Task.Delay(11000);
                if (IsDisposed || webView?.CoreWebView2 == null) return;
                string folder = Path.GetDirectoryName(options.TelemetryFilePath ?? "");
                if (string.IsNullOrEmpty(folder)) folder = appDataDir;
                Directory.CreateDirectory(folder);
                string script = "(() => { const b = document.querySelector('.ytp-size-button'); " +
                    "if (!b) return null; const r=b.getBoundingClientRect(); " +
                    "return {x:r.left+r.width/2,y:r.top+r.height/2,width:r.width,height:r.height}; })()";
                string geometry = await webView.CoreWebView2.ExecuteScriptAsync(script);
                File.WriteAllText(Path.Combine(folder, "theater-button-geometry.json"), geometry);
                string viewingProbe = "(() => { const l=window.__TIZENTUBE_LOADER__; " +
                    "const v=l?.viewing; return { path:location.pathname, " +
                    "bundlePresent:!!l, viewingPresent:!!v, mounted:v?.mounted??null, " +
                    "disposed:v?.disposed??null, videoIdPresent:!!v?.getVideoId?.(), " +
                    "controlsPresent:!!document.querySelector('.ytp-right-controls'), " +
                    "theaterButtonPresent:!!document.querySelector('.ytp-size-button'), " +
                    "pipButtonPresent:!!document.querySelector('#tizentube-native-pip'), " +
                    "theaterListenerPresent:!!v?.theaterButton, " +
                    "storedPreference:v?.savedTheaterState?.()??null, " +
                    "isNavigating:v?.isNavigating??null }; })()";
                File.WriteAllText(Path.Combine(folder, "theater-viewing-before.json"),
                    await webView.CoreWebView2.ExecuteScriptAsync(viewingProbe));
                if (options.TheaterUserProbe && geometry != "null")
                {
                    using (var values = System.Text.Json.JsonDocument.Parse(geometry))
                    {
                        double x = values.RootElement.GetProperty("x").GetDouble();
                        double y = values.RootElement.GetProperty("y").GetDouble();
                        if (x > 0 && y > 0 &&
                            values.RootElement.GetProperty("width").GetDouble() > 5)
                        {
                            string press = System.Text.Json.JsonSerializer.Serialize(new {
                                type = "mousePressed", x, y, button = "left", clickCount = 1 });
                            string release = System.Text.Json.JsonSerializer.Serialize(new {
                                type = "mouseReleased", x, y, button = "left", clickCount = 1 });
                            await webView.CoreWebView2.CallDevToolsProtocolMethodAsync(
                                "Input.dispatchMouseEvent", press);
                            await webView.CoreWebView2.CallDevToolsProtocolMethodAsync(
                                "Input.dispatchMouseEvent", release);
                            await Task.Delay(900);
                        }
                    }
                }
                string snapshot = await webView.CoreWebView2.ExecuteScriptAsync(
                    "window.__ttFloating?.diagnostics() || null");
                File.WriteAllText(Path.Combine(folder, "theater-viewing-after.json"),
                    await webView.CoreWebView2.ExecuteScriptAsync(viewingProbe));
                File.WriteAllText(Path.Combine(folder, options.TheaterUserProbe
                    ? "theater-after-click.json" : "theater-after-restart.json"), snapshot);
                if (options.TheaterRestoreProbe)
                {
                    await Task.Delay(12500);
                    if (!IsDisposed && webView?.CoreWebView2 != null)
                    {
                        File.WriteAllText(Path.Combine(folder, "theater-after-settle.json"),
                            await webView.CoreWebView2.ExecuteScriptAsync(
                                "window.__ttFloating?.diagnostics() || null"));
                        File.WriteAllText(Path.Combine(folder, "theater-restore-count.txt"),
                            Interlocked.Read(ref nativeTheaterRestored).ToString());
                    }
                }
                string persisted = File.Exists(theaterPreferenceFile)
                    ? File.ReadAllText(theaterPreferenceFile) : "NOT_SAVED";
                File.WriteAllText(Path.Combine(folder, "theater-native-preference.txt"), persisted);
                Console.WriteLine("[Host Theater] Local DOM and preference probe saved");
            }
            catch (Exception ex) { Console.Error.WriteLine("[Host Theater Probe] " + ex.Message); }
        }

        private async Task RestoreTheaterViaTrustedInputAsync(bool wanted)
        {
            if (webView?.CoreWebView2 == null || theaterRestoreInProgress ||
                nativeFloatingActive || options.HeadlessMode ||
                (DateTime.UtcNow - lastTheaterRestoreAttemptUtc).TotalMilliseconds < 2600) return;
            lastTheaterRestoreAttemptUtc = DateTime.UtcNow;
            theaterRestoreInProgress = true;
            bool suppressionSet = false;
            try
            {
                string state = await webView.CoreWebView2.ExecuteScriptAsync(
                    "(() => { const b=document.querySelector('.ytp-size-button'); " +
                    "const flexy=document.querySelector('ytd-watch-flexy'); " +
                    "if (!b || !flexy || location.pathname !== '/watch') return null; " +
                    "const r=b.getBoundingClientRect(); return {theater:flexy.hasAttribute('theater')," +
                    "x:r.left+r.width/2,y:r.top+r.height/2,width:r.width,height:r.height}; })()");
                if (state == "null") return;
                using (var data = System.Text.Json.JsonDocument.Parse(state))
                {
                    var obj = data.RootElement;
                    if (obj.GetProperty("theater").GetBoolean() == wanted) return;
                    double x = obj.GetProperty("x").GetDouble();
                    double y = obj.GetProperty("y").GetDouble();
                    if (x < 0 || y < 0 || obj.GetProperty("width").GetDouble() < 5 ||
                        obj.GetProperty("height").GetDouble() < 5 ||
                        x >= webView.Width || y >= webView.Height) return;
                    // Click the EXISTING YouTube size button rather than
                    // changing CSS/attributes behind YouTube's state machine.
                    string press = System.Text.Json.JsonSerializer.Serialize(new {
                        type = "mousePressed", x, y, button = "left", clickCount = 1 });
                    string release = System.Text.Json.JsonSerializer.Serialize(new {
                        type = "mouseReleased", x, y, button = "left", clickCount = 1 });
                    // CDP mouse input is a trusted DOM click. Mark this one
                    // as an AUTOMATIC restore before dispatching, otherwise
                    // ViewingExperience mistakes it for a new user choice and
                    // may overwrite the persisted preference with false as
                    // YouTube hydrates asynchronously (verified on PC).
                    await webView.CoreWebView2.ExecuteScriptAsync(
                        "window.__TT_RESTORING_THEATER = true");
                    suppressionSet = true;
                    await webView.CoreWebView2.CallDevToolsProtocolMethodAsync(
                        "Input.dispatchMouseEvent", press);
                    await webView.CoreWebView2.CallDevToolsProtocolMethodAsync(
                        "Input.dispatchMouseEvent", release);
                    await Task.Delay(520);
                    Interlocked.Increment(ref nativeTheaterRestored);
                }
            }
            catch (Exception ex) { Debug.WriteLine("[Host Theater Restore] " + ex.Message); }
            finally
            {
                if (suppressionSet && webView?.CoreWebView2 != null)
                {
                    try { await webView.CoreWebView2.ExecuteScriptAsync(
                        "window.__TT_RESTORING_THEATER = false"); }
                    catch { /* A navigation destroys the old document anyway. */ }
                }
                theaterRestoreInProgress = false;
            }
        }

        private async Task ToggleFloatingWindowAsync(bool restore = false)
        {
            if (webView?.CoreWebView2 == null || options.HeadlessMode) return;
            if (restore || nativeFloatingActive)
            {
                SetNativeFloatingWindow(false);
                await webView.CoreWebView2.ExecuteScriptAsync(
                    "window.__ttFloating?.stop()");
                return;
            }
            if (nativeImmersiveActive || webPlayerFullscreen) return;
            // Move the SAME #movie_player to body instead of positioning it
            // under YouTube's clipped/transformed watch ancestors. The old
            // fixed CSS rendered controls but only black video in real usage.
            string activated = await webView.CoreWebView2.ExecuteScriptAsync(
                "window.__ttFloating?.start() === true");
            if (activated == "true")
            {
                SetNativeFloatingWindow(true);
                if (options.SmokeTest)
                {
                    await Task.Delay(700);
                    string metrics = await webView.CoreWebView2.ExecuteScriptAsync(
                        "window.__ttFloating?.diagnostics() || null");
                    File.WriteAllText(Path.Combine(appDataDir, "floating-video-diagnostic.json"), metrics);
                }
            }
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

                    if (json.Contains("\"channel\":\"window:toggle-floating\"") ||
                        json.Contains("\"channel\":\"window:restore-floating\""))
                    {
                        if (Uri.TryCreate(args.Source, UriKind.Absolute, out Uri source) &&
                            source.Scheme == "https" &&
                            (source.Host == "www.youtube.com" || source.Host == "youtube.com"))
                        {
                            bool restore = json.Contains("\"channel\":\"window:restore-floating\"");
                            _ = ToggleFloatingWindowAsync(restore);
                        }
                        return;
                    }

                    if (json.Contains("\"channel\":\"viewing:theater\""))
                    {
                        if (Uri.TryCreate(args.Source, UriKind.Absolute, out Uri sender) &&
                            sender.Scheme == "https" &&
                            (sender.Host == "www.youtube.com" || sender.Host == "youtube.com") &&
                            json.Length < 500)
                        {
                            using (var parsed = System.Text.Json.JsonDocument.Parse(json))
                            {
                                if (parsed.RootElement.TryGetProperty("enabled", out var value) &&
                                    (value.ValueKind == System.Text.Json.JsonValueKind.True ||
                                     value.ValueKind == System.Text.Json.JsonValueKind.False))
                                {
                                    string tmp = theaterPreferenceFile + ".tmp";
                                    File.WriteAllText(tmp, value.GetBoolean() ? "true" : "false");
                                    File.Move(tmp, theaterPreferenceFile, true);
                                }
                            }
                        }
                        return;
                    }

                    if (json.Contains("\"channel\":\"viewing:restore-theater\""))
                    {
                        if (Uri.TryCreate(args.Source, UriKind.Absolute, out Uri sender) &&
                            sender.Scheme == "https" &&
                            (sender.Host == "www.youtube.com" || sender.Host == "youtube.com") &&
                            json.Length < 500)
                        {
                            using (var parsed = System.Text.Json.JsonDocument.Parse(json))
                            {
                                if (parsed.RootElement.TryGetProperty("enabled", out var value) &&
                                    (value.ValueKind == System.Text.Json.JsonValueKind.True ||
                                     value.ValueKind == System.Text.Json.JsonValueKind.False))
                                    _ = RestoreTheaterViaTrustedInputAsync(value.GetBoolean());
                            }
                        }
                        return;
                    }

                    // Message dispatching for SponsorBlock skip notifications, memory requests, preferences, etc.
                    if (json.Contains("\"channel\":\"adblock:diagnostic\""))
                    {
                        // User-invoked Ctrl+Shift+F10, scoped to the first-party
                        // YouTube document. The JS payload is metadata-only;
                        // never transmit private user session data or upload it.
                        if (Uri.TryCreate(args.Source, UriKind.Absolute, out Uri sender) &&
                            sender.Scheme == "https" &&
                            (sender.Host == "www.youtube.com" || sender.Host == "youtube.com") &&
                            json.Length <= 16000)
                        {
                            string output = Path.Combine(appDataDir, "adblock-diagnostic.json");
                            File.WriteAllText(output, json);
                            Console.WriteLine("[Host AdBlock] Local diagnostic saved at: " + output);
                            if (!options.SmokeTest)
                                MessageBox.Show(
                                    "Se guardó un diagnóstico de estructura publicitaria en:\n\n" + output +
                                    "\n\nSolo contiene tipos de elementos y etiquetas de anuncios; no registra contraseñas, cookies, títulos ni identificadores de vídeos.",
                                    "TizenTube — diagnóstico local",
                                    MessageBoxButtons.OK, MessageBoxIcon.Information);
                        }
                    }
                    else if (json.Contains("sponsorblock:skipped"))
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
                        // Informational only. CoreWebView2.ContainsFullScreenElementChanged
                        // controls the native window. Never process fullscreen
                        // events twice (an out-of-order IPC caused restore bugs).
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
            // All functional mods are part of the actual .exe, not optional
            // files beside it. Older releases silently fell back to a tiny
            // JSON.parse patch when a user dragged only the EXE to Desktop.
            // That created an apparently working YouTube browser with NO
            // SponsorBlock, DeArrow or full AdBlock — never do that again.
            string scriptContent = ReadEmbeddedRequired("TizenTube.InjectedBundle");
            string css = ReadEmbeddedRequired("TizenTube.InjectedStyles");
            string cssBase64 = Convert.ToBase64String(Encoding.UTF8.GetBytes(css));
            string injectCssScript = "(() => { const s = document.createElement('style'); " +
                "s.id = 'tizentube-ui-styles'; " +
                "s.textContent = new TextDecoder().decode(Uint8Array.from(atob('" + cssBase64 +
                "'), c => c.charCodeAt(0))); " +
                "(document.head || document.documentElement).appendChild(s); })();";
            await webView.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(injectCssScript);

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

            // 3. Inject the complete, version-matched in-assembly IIFE bundle.
            // Video compositing fix lives in a separate, auditable script.
            await webView.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(
                ReadEmbeddedRequired("TizenTube.FloatingPlayer"));
            // The owner's explicit theater preference is durable independently
            // of YouTube's own UI resets or localStorage migrations.
            if (File.Exists(theaterPreferenceFile))
            {
                string preferred = File.ReadAllText(theaterPreferenceFile).Trim();
                if (preferred == "true" || preferred == "false")
                    await webView.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(
                        "window.__TT_THEATER_PREF = " + preferred + ";");
            }
            await webView.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(scriptContent);
        }

        private static string ReadEmbeddedRequired(string resourceName)
        {
            using (var stream = System.Reflection.Assembly.GetExecutingAssembly().GetManifestResourceStream(resourceName))
            {
                if (stream == null)
                    throw new InvalidOperationException("Required TizenTube component missing from EXE: " + resourceName);
                using (var reader = new StreamReader(stream, Encoding.UTF8))
                {
                    string contents = reader.ReadToEnd();
                    if (string.IsNullOrWhiteSpace(contents))
                        throw new InvalidOperationException("Required TizenTube component is empty: " + resourceName);
                    return contents;
                }
            }
        }

        private void SetupMemoryTrimming()
        {
            // Trims the host working set at most every 2 minutes *only while minimized*.
            // NOTE: EmptyWorkingSet unmaps physical RAM pages to the Windows paging file,
            // lowering Working Set metrics during idle or minimized states. Real private bytes
            // reduction is achieved via single-renderer process limits, cache limits, and mod cache flushes.
            memoryTrimTimer = new System.Windows.Forms.Timer { Interval = 120000 };
            memoryTrimTimer.Tick += (s, e) => {
                if (WindowState == FormWindowState.Minimized) TrimMemoryNow();
            };
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

                // EmptyWorkingSet during video playback causes refaults and
                // stalls. Only trim the host's own memory while minimized.
                if (WindowState == FormWindowState.Minimized)
                    EmptyWorkingSet(Process.GetCurrentProcess().Handle);

                // Never trim every msedgewebview2.exe process on the machine:
                // some belong to Edge, Teams, other apps or separate profiles.
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
            sb.AppendLine($"    \"windowCyclePass\": {Interlocked.Read(ref windowCyclePass)},");
            sb.AppendLine($"    \"windowFullMonitorPass\": {Interlocked.Read(ref windowFullMonitorPass)},");
            sb.AppendLine($"    \"windowRestorePass\": {Interlocked.Read(ref windowRestorePass)},");
            sb.AppendLine($"    \"windowPlacementRestored\": {Interlocked.Read(ref windowPlacementRestored)},");
            sb.AppendLine($"    \"floatingAcceleratorHandled\": {Interlocked.Read(ref floatingAcceleratorHandled)},");
            sb.AppendLine($"    \"floatingHotKeyWindowsTriggered\": {Interlocked.Read(ref floatingHotKeyWindowsTriggered)},");
            sb.AppendLine($"    \"floatingWindowCyclePass\": {Interlocked.Read(ref floatingWindowCyclePass)},");
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
            // WinForms fallback when the native title bar, not WebView, has
            // focus. With WebView focus its KeyDown handler owns the shortcut.
            if ((webView == null || !webView.ContainsFocus) &&
                (keyData == (Keys.Control | Keys.Shift | Keys.P) || keyData == Keys.F9))
            {
                _ = ToggleFloatingWindowAsync();
                return true;
            }
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
            // F11 can hide the native frame even on the home feed.
            // If the web player is fullscreen, F11 exits that player first.
            if (webPlayerFullscreen)
            {
                _ = webView.CoreWebView2.ExecuteScriptAsync(
                    "if(document.fullscreenElement) document.exitFullscreen();");
                return;
            }
            manualImmersiveMode = !manualImmersiveMode;
            UpdateNativeImmersiveMode();
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            if (nativeFloatingActive && e.CloseReason == CloseReason.UserClosing)
            {
                e.Cancel = true;
                _ = ToggleFloatingWindowAsync(true); // X restores the regular app, does not stop video.
                return;
            }
            DisableFocusedFloatingHotkey();
            // Do not persist a miniature window, immersive bounds or minimized
            // state on shutdown. Only the last normal/restorable geometry.
            if (!nativeFloatingActive && !nativeImmersiveActive) SaveWindowPlacement();
            memoryTrimTimer?.Stop();
            memoryTrimTimer?.Dispose();
            smokeTestTimer?.Stop();
            smokeTestTimer?.Dispose();
            webView?.Dispose();
            base.OnFormClosing(e);
        }
    }
}
