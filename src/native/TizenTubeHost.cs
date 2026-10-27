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
using System.Linq;
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
        public bool FloatingCycleProbe { get; set; } = false;
        public bool FloatingFixtureProbe { get; set; } = false;
        public bool AdblockExtensionProbe { get; set; } = false;
        public bool TheaterUserProbe { get; set; } = false;
        public bool TheaterRestoreProbe { get; set; } = false;
        public bool PreferencesSetupProbe { get; set; } = false;
        public bool PreferencesRestartProbe { get; set; } = false;
        public bool NavigationBackProbe { get; set; } = false;
        public bool KeyboardShortcutsProbe { get; set; } = false;
        public bool NavigationPlaybackProbe { get; set; } = false;
        public bool UnmodifiedWebViewProbe { get; set; } = false;
        public bool TitlebarProbe { get; set; } = false;
        public bool SessionSetupProbe { get; set; } = false;
        public bool SessionRestoreProbe { get; set; } = false;

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
                else if (arg == "--floating-cycle-probe")
                {
                    options.FloatingCycleProbe = true;
                }
                else if (arg == "--floating-fixture-probe")
                {
                    options.FloatingFixtureProbe = true;
                    options.FloatingCycleProbe = true;
                }
                else if (arg == "--adblock-extension-probe")
                {
                    options.AdblockExtensionProbe = true;
                }
                else if (arg == "--theater-user-probe")
                {
                    options.TheaterUserProbe = true;
                }
                else if (arg == "--theater-restore-probe")
                {
                    options.TheaterRestoreProbe = true;
                }
                else if (arg == "--preferences-setup-probe") options.PreferencesSetupProbe = true;
                else if (arg == "--preferences-restart-probe") options.PreferencesRestartProbe = true;
                else if (arg == "--navigation-back-probe") options.NavigationBackProbe = true;
                else if (arg == "--keyboard-shortcuts-probe") options.KeyboardShortcutsProbe = true;
                else if (arg == "--navigation-playback-probe") options.NavigationPlaybackProbe = true;
                else if (arg == "--unmodified-webview-probe") options.UnmodifiedWebViewProbe = true;
                else if (arg == "--titlebar-probe") options.TitlebarProbe = true;
                else if (arg == "--session-setup-probe") options.SessionSetupProbe = true;
                else if (arg == "--session-restore-probe") options.SessionRestoreProbe = true;
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
        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool SetProcessDpiAwarenessContext(IntPtr dpiContext);
        private static readonly IntPtr DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2 = (IntPtr)(-4);

        [STAThread]
        public static int Main(string[] args)
        {
            try
            {
                SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
            }
            catch { }

            var options = HostOptions.Parse(args);
            if (args?.Length == 1 && args[0] == "--verify-in-place-updater")
                return PortableUpdater.VerifyInPlaceUpdate();
            if (args?.Length == 2 && args[0] == "--verify-detached-updater-host")
                return PortableUpdater.VerifyDetachedUpdaterHost(args[1], Path.Combine(
                    Path.GetTempPath(), "tizentube-update-smoke-" + Guid.NewGuid().ToString("N")));
            // A detached copy of the same signed-by-source portable executable
            // performs replacement only after the original process exits.
            if (args?.Length == 5 && args[0] == "--apply-update")
                return PortableUpdater.ApplyVerifiedUpdate(args[1], args[2], args[3], args[4]);
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
        [DllImport("user32.dll")]
        private static extern bool ReleaseCapture();
        [DllImport("user32.dll")]
        private static extern IntPtr SendMessage(IntPtr hwnd, int msg, IntPtr wparam, IntPtr lparam);
        [DllImport("user32.dll", SetLastError = true)]
        private static extern int GetWindowLong(IntPtr hwnd, int index);
        private const int WmNcHitTest = 0x0084;
        private const int WmNcLButtonDown = 0x00A1;
        private const int HtClient = 1;
        private const int HtCaption = 2;
        private const int HtLeft = 10;
        private const int HtRight = 11;
        private const int HtTop = 12;
        private const int HtTopLeft = 13;
        private const int HtTopRight = 14;
        private const int HtBottom = 15;
        private const int HtBottomLeft = 16;
        private const int HtBottomRight = 17;
        private const int ResizeHitArea = 7;
        private const int WsSysMenu = 0x00080000;
        private const int WsMinimizeBox = 0x00020000;
        private const int WsMaximizeBox = 0x00010000;
        // Taskbar-click toggling requires the system-menu and minimize styles.
        // Do NOT add WS_THICKFRAME to a FormBorderStyle.None window: mixing a
        // WinForms nonclient region with the thick frame rendered a second,
        // Windows-colored system caption over our dark integrated toolbar.
        // Resize grips are supplied by ApplyBorderlessHitTest below.
        protected override CreateParams CreateParams
        {
            get
            {
                var cp = base.CreateParams;
                cp.Style |= WsSysMenu | WsMinimizeBox | WsMaximizeBox;
                return cp;
            }
        }
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
        private NavigationToolbar navigationToolbar;
        private TableLayoutPanel chromeLayout;
        private System.Windows.Forms.Timer memoryTrimTimer;
        private System.Windows.Forms.Timer smokeTestTimer;
        private string appDataDir;
        private string theaterPreferenceFile;
        private string lastVideoSessionFile;
        private bool theaterRestoreInProgress = false;
        private DateTime lastTheaterRestoreAttemptUtc = DateTime.MinValue;
        private long nativeTheaterRestored = 0;
        private bool floatingVisualProbeStarted = false;
        private bool floatingCycleProbeStarted = false;
        private bool theaterProbeStarted = false;
        private bool preferencesProbeStarted = false;
        private bool keyboardProbeStarted = false;
        private bool playbackJourneyProbeStarted = false;
        private long blockedAdCount = 0;
        private long trimCount = 0;
        private long modsInitializedCount = 0;
        private long sponsorBlockSkipCount = 0;
        // Independent check that document-start cosmetic filtering actually
        // reaches a loaded WebView2 DOM (not merely bundled at compile time).
        private long adblockStyleObserved = 0;
        private long adblockRuntimeObserved = 0;
        private long ubolExtensionEnabled = 0;
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
            // The one compact toolbar owns window controls. The standard
            // Windows caption is intentionally removed, not duplicated.
            this.FormBorderStyle = FormBorderStyle.None;
            this.MaximizeBox = true;
            this.MinimizeBox = true;
            this.StartPosition = FormStartPosition.CenterScreen;
            this.MaximizedBounds = Screen.PrimaryScreen.WorkingArea;
            this.BackColor = Color.FromArgb(15, 15, 15);
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
            // CI session runs must not reuse personal Google/WebView profiles.
            string sessionTestRoot = Environment.GetEnvironmentVariable("TIZENTUBE_TEST_SESSION_DIR");
            if ((options.SessionSetupProbe || options.SessionRestoreProbe) &&
                !string.IsNullOrWhiteSpace(sessionTestRoot))
                appDataDir = Path.Combine(sessionTestRoot, "webview");
            Directory.CreateDirectory(appDataDir);
            theaterPreferenceFile = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "TizenTube", this.options.TvMode ? "tv-theater-preference.json" : "theater-preference.json");
            lastVideoSessionFile = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "TizenTube", this.options.TvMode ? "tv-last-video-session.json" : "last-video-session.json");
            if ((options.SessionSetupProbe || options.SessionRestoreProbe) &&
                !string.IsNullOrWhiteSpace(sessionTestRoot))
            {
                theaterPreferenceFile = Path.Combine(sessionTestRoot, "theater-preference.json");
                lastVideoSessionFile = Path.Combine(sessionTestRoot, "last-video-session.json");
            }
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
            this.SizeChanged += (s, e) => {
                if (WindowState == FormWindowState.Maximized &&
                    !nativeImmersiveActive && !nativeFloatingActive)
                    MaximizedBounds = Screen.FromControl(this).WorkingArea;
                navigationToolbar?.SetMaximized(WindowState == FormWindowState.Maximized);
            };

            if (!this.options.SmokeTest && !this.options.HeadlessMode)
                this.Shown += async (s, e) => {
                    await Task.Delay(3500);
                    if (!IsDisposed && !nativeFloatingActive)
                        await PortableUpdater.CheckForUpdatesAsync(this, true);
                };

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
            if (this.options.TitlebarProbe && !this.options.HeadlessMode)
            {
                this.Shown += async (sender, evt) => {
                    await Task.Delay(3500);
                    if (IsDisposed || navigationToolbar == null) { ExitCode = 12; return; }
                    WindowState = FormWindowState.Normal;
                    Rectangle bounds = Bounds;
                    string folder = Path.GetDirectoryName(options.TelemetryFilePath ?? "");
                    if (string.IsNullOrEmpty(folder)) folder = appDataDir;
                    Directory.CreateDirectory(folder);
                    chromeLayout.PerformLayout();
                    bool webviewBelowBar = chromeLayout.Controls.Contains(webView) &&
                        chromeLayout.Controls.Contains(navigationToolbar) &&
                        chromeLayout.GetRow(webView) == 1 &&
                        chromeLayout.GetRow(navigationToolbar) == 0 &&
                        webView.PointToScreen(Point.Empty).Y >=
                            navigationToolbar.PointToScreen(Point.Empty).Y + navigationToolbar.Height;
                    int windowStyle = GetWindowLong(Handle, -16);
                    bool nativeTaskbarMinimize = ShowInTaskbar &&
                        (windowStyle & (WsSysMenu | WsMinimizeBox)) ==
                            (WsSysMenu | WsMinimizeBox);
                    bool oneBar = FormBorderStyle == FormBorderStyle.None &&
                        navigationToolbar.Visible && navigationToolbar.Height == 38 &&
                        chromeLayout.Controls.Contains(navigationToolbar);
                    // The toolbar's own DrawToBitmap can be dark while the
                    // *actual* screen still contains a light Windows caption
                    // above it. Sample the composed screen at window y+9.
                    Color topScreenPixel;
                    using (var realFrame = new Bitmap(1, 1))
                    using (var graphics = Graphics.FromImage(realFrame))
                    {
                        graphics.CopyFromScreen(Left + 155, Top + 9, 0, 0,
                            new Size(1, 1), CopyPixelOperation.SourceCopy);
                        topScreenPixel = realFrame.GetPixel(0, 0);
                    }
                    bool noNativeCaptionOverlay =
                        topScreenPixel.R < 95 && topScreenPixel.G < 95 &&
                        topScreenPixel.B < 95;
                    navigationToolbar.InvokeMaximizeForProbe();
                    await Task.Delay(300);
                    bool maximized = WindowState == FormWindowState.Maximized &&
                        navigationToolbar.IsMaximized &&
                        MaximizedBounds == Screen.FromControl(this).WorkingArea;
                    // The screenshot showed a thin desktop-colored frame.
                    // Test the HWND client origin, not just WinForms state.
                    var client = new Rectangle(PointToScreen(ClientRectangle.Location),
                        ClientRectangle.Size);
                    bool maximizedClientFillsWorkArea =
                        client == Screen.FromControl(this).WorkingArea;
                    navigationToolbar.InvokeMaximizeForProbe();
                    await Task.Delay(300);
                    bool restored = WindowState == FormWindowState.Normal &&
                        !navigationToolbar.IsMaximized && FormBorderStyle == FormBorderStyle.None;
                    navigationToolbar.InvokeMinimizeForProbe();
                    await Task.Delay(300);
                    bool minimized = WindowState == FormWindowState.Minimized;
                    WindowState = FormWindowState.Normal;
                    Bounds = bounds;
                    using (var bitmap = new Bitmap(navigationToolbar.Width, navigationToolbar.Height))
                    {
                        navigationToolbar.DrawToBitmap(bitmap, new Rectangle(Point.Empty, bitmap.Size));
                        bitmap.Save(Path.Combine(folder, "titlebar-integrated.png"),
                            System.Drawing.Imaging.ImageFormat.Png);
                    }
                    var proof = new { oneBar, noNativeCaptionOverlay,
                        topScreenPixel = new { topScreenPixel.R, topScreenPixel.G, topScreenPixel.B },
                        maximized, maximizedClientFillsWorkArea,
                        maxClient = client.ToString(),
                        workArea = Screen.FromControl(this).WorkingArea.ToString(),
                        restored, minimized,
                        webviewBelowBar, nativeTaskbarMinimize,
                        height = navigationToolbar.Height, border = FormBorderStyle.ToString() };
                    File.WriteAllText(Path.Combine(folder, "titlebar-acceptance.json"),
                        System.Text.Json.JsonSerializer.Serialize(proof));
                    if (!oneBar || !noNativeCaptionOverlay ||
                        !webviewBelowBar || !nativeTaskbarMinimize ||
                        !maximized || !maximizedClientFillsWorkArea ||
                        !restored || !minimized) ExitCode = 12;
                    Console.WriteLine($"[Titlebar] oneBar={oneBar} maximized={maximized} restored={restored} minimized={minimized}");
                };
            }
            if ((this.options.SessionSetupProbe || this.options.SessionRestoreProbe) &&
                !this.options.HeadlessMode)
            {
                this.Shown += async (sender, evt) => {
                    await Task.Delay(options.SessionSetupProbe ? 7000 : 11000);
                    if (IsDisposed || webView?.CoreWebView2 == null) { ExitCode = 14; return; }
                    string folder = Path.GetDirectoryName(options.TelemetryFilePath ?? "");
                    if (string.IsNullOrEmpty(folder)) folder = appDataDir;
                    Directory.CreateDirectory(folder);
                    try
                    {
                        if (options.SessionSetupProbe)
                        {
                            // Simulate a durable checkpoint without inventing
                            // functional video playback in a cloud runner.
                            string proof = await webView.CoreWebView2.ExecuteScriptAsync(
                                "(() => {const state={id:'aqz-KE-bpKQ',position:137," +
                                "duration:2100,updatedAt:Date.now()};" +
                                "localStorage.setItem('tizentube.lastVideo.v1',JSON.stringify(state));" +
                                "localStorage.setItem('tizentube.theater.v1','true');" +
                                "return {saved:localStorage.getItem('tizentube.lastVideo.v1')!==null};})()");
                            File.WriteAllText(Path.Combine(folder, "session-setup.json"), proof);
                            File.WriteAllText(theaterPreferenceFile, "true");
                            string sessionJson = "{\"id\":\"aqz-KE-bpKQ\",\"position\":137,\"duration\":2100,\"updatedAt\":" +
                                DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() + "}";
                            File.WriteAllText(lastVideoSessionFile, sessionJson);
                            if (!proof.Contains("\"saved\":true")) ExitCode = 14;
                        }
                        else
                        {
                            string state = await webView.CoreWebView2.ExecuteScriptAsync(
                                "(() => ({href:location.href,theater:" +
                                "window.__TIZENTUBE_LOADER__?.viewing?.savedTheaterState?.()??null}))()");
                            File.WriteAllText(Path.Combine(folder, "session-reopen.json"), state);
                            if (!state.Contains("aqz-KE-bpKQ") || !state.Contains("t=137s") ||
                                !state.Contains("\"theater\":true")) ExitCode = 14;
                        }
                    }
                    catch (Exception ex)
                    {
                        Console.Error.WriteLine("[Host Session Probe] " + ex.Message);
                        ExitCode = 14;
                    }
                };
            }
        }

        private void SetupNavigationToolbar()
        {
            navigationToolbar = new NavigationToolbar(this.Icon,
                () => {
                    if (webView?.CoreWebView2?.CanGoBack == true)
                        webView.CoreWebView2.GoBack();
                },
                () => {
                    webView?.CoreWebView2?.Reload();
                },
                DragNativeWindow,
                () => { WindowState = FormWindowState.Minimized; },
                ToggleNativeMaximize,
                () => { Close(); },
                () => { _ = ToggleFloatingWindowAsync(true); },
                () => { _ = ShowProtectionsAsync(); },
                () => { _ = PortableUpdater.CheckForUpdatesAsync(this, false); });
            navigationToolbar.Dock = DockStyle.Fill;
            navigationToolbar.Margin = Padding.Empty;
            chromeLayout.Controls.Add(navigationToolbar, 0, 0);
            navigationToolbar.SetMaximized(WindowState == FormWindowState.Maximized);
            UpdateNavigationToolbarVisibility();
        }

        private async Task ShowProtectionsAsync()
        {
            if (webView?.CoreWebView2 == null)
            {
                MessageBox.Show("El navegador todavía está iniciándose.", "TizenTube");
                return;
            }
            try
            {
                // Read the actual initialized JS module, never infer enabled
                // status from bundle presence or the presence of a badge.
                string info = await webView.CoreWebView2.ExecuteScriptAsync(
                    "(() => {const l=window.__TIZENTUBE_LOADER__;" +
                    "if(!l?.initialized)return 'Los módulos todavía no están activos';" +
                    "const s=l.sponsorblock;const a=l.adblock;" +
                    "const st=s?.getStats?.()||{};const v=l.playback?.videoElement;" +
                    "const player=document.querySelector?.('.html5-video-player.ad-showing, #movie_player.ad-showing');" +
                    "const skip=document.querySelector?.('.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button, .ytp-skip-ad-button-modern, .videoAdUiSkipButton, .ytp-ad-skip-button-container button');" +
                    "const labels={no_video:'sin vídeo detectado',loading:'consultando API'," +
                    "segments_found:'segmentos recibidos',no_segments:'sin segmentos registrados'," +
                    "network_error:'fallo al consultar API',rate_limited:'API con límite de solicitudes'," +
                    "unavailable:'API temporalmente no disponible'};" +
                    "return ['SponsorBlock: '+(s?.options?.enabled?'activo':'desactivado')," +
                    "'Saltar segmentos automáticamente: '+(s?.options?.autoSkip?'sí':'no')," +
                    "'Vídeo identificado: '+(st.currentVideoId||'ninguno')," +
                    "'Reproductor conectado: '+(v?'sí':'no')," +
                    "'Consulta: '+(labels[st.lastFetchStatus]||'desconocida')," +
                    "'Segmentos del vídeo: '+(st.segmentCount??0)," +
                    "'Saltos realizados: '+(st.skipCount??0)," +
                    "'Publicidad en reproducción: '+(player?'sí':'no')," +
                    "'Botón Saltar anuncio: '+(skip?'detectado':'no disponible')," +
                    "'Intentos de salto de anuncios: '+(a?.adSkipAttempts??0)," +
                    "'Ayuda para anuncios saltables: '+(a?._externalAdSkipOnly?'activa':'modo clásico')," +
                    "'Filtros AdBlock clásicos: '+(a?.options?.enabled?'activos':'desactivados')].join(String.fromCharCode(10));})()");
                string state = System.Text.Json.JsonSerializer.Deserialize<string>(info)
                    ?? "No se pudo leer el estado.";
                string nativeBlocker = Interlocked.Read(ref ubolExtensionEnabled) == 1
                    ? "uBlock Origin Lite: habilitado en WebView2\n"
                    : "uBlock Origin Lite: no disponible (filtros limitados de respaldo)\n";
                if (MessageBox.Show(nativeBlocker + state + "\n\n¿Abrir ajustes de protecciones?", "Protecciones TizenTube",
                    MessageBoxButtons.YesNo, MessageBoxIcon.Information) == DialogResult.Yes)
                    await webView.CoreWebView2.ExecuteScriptAsync(
                        "window.__TIZENTUBE_LOADER__?.ui?.settingsModal?.open?.();");
            }
            catch (Exception ex)
            {
                MessageBox.Show("No se pudo consultar SponsorBlock: " + ex.Message,
                    "TizenTube", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }

        private void DragNativeWindow()
        {
            if (nativeImmersiveActive) return;
            // Send a native NC caption interaction to preserve Windows drag,
            // Aero Snap and the standard window move behavior.
            ReleaseCapture();
            SendMessage(Handle, WmNcLButtonDown, (IntPtr)HtCaption, IntPtr.Zero);
        }

        private void ToggleNativeMaximize()
        {
            if (nativeImmersiveActive || nativeFloatingActive) return;
            if (WindowState == FormWindowState.Maximized)
                WindowState = FormWindowState.Normal;
            else
            {
                MaximizedBounds = Screen.FromControl(this).WorkingArea;
                WindowState = FormWindowState.Maximized;
            }
            navigationToolbar?.SetMaximized(WindowState == FormWindowState.Maximized);
        }

        private void ApplyBorderlessHitTest(ref Message m)
        {
            if (m.Msg != WmNcHitTest || m.Result.ToInt64() != HtClient ||
                WindowState != FormWindowState.Normal ||
                nativeImmersiveActive ||
                FormBorderStyle != FormBorderStyle.None) return;
            // A borderless Windows form normally cannot be resized. Return
            // genuine non-client hit-test codes for the screen-edge grips.
            Point point = PointToClient(Cursor.Position);
            bool left = point.X >= 0 && point.X < ResizeHitArea;
            bool right = point.X <= Width && point.X >= Width - ResizeHitArea;
            bool top = point.Y >= 0 && point.Y < ResizeHitArea;
            bool bottom = point.Y <= Height && point.Y >= Height - ResizeHitArea;
            if (left && top) m.Result = (IntPtr)HtTopLeft;
            else if (right && top) m.Result = (IntPtr)HtTopRight;
            else if (left && bottom) m.Result = (IntPtr)HtBottomLeft;
            else if (right && bottom) m.Result = (IntPtr)HtBottomRight;
            else if (left) m.Result = (IntPtr)HtLeft;
            else if (right) m.Result = (IntPtr)HtRight;
            else if (top) m.Result = (IntPtr)HtTop;
            else if (bottom) m.Result = (IntPtr)HtBottom;
        }
        private void UpdateNavigationToolbar()
        {
            if (navigationToolbar == null || IsDisposed || webView?.CoreWebView2 == null) return;
            navigationToolbar.SetBackEnabled(webView.CoreWebView2.CanGoBack);
            // DocumentTitleChanged includes YouTube's current video title;
            // no URL, account or browsing history is copied out of WebView2.
            navigationToolbar.SetTitle(webView.CoreWebView2.DocumentTitle);
        }

        private void UpdateNavigationToolbarVisibility()
        {
            if (navigationToolbar == null || chromeLayout == null || IsDisposed) return;
            bool visible = !nativeImmersiveActive;
            chromeLayout.SuspendLayout();
            try
            {
                chromeLayout.RowStyles[0].Height = visible ? 38 : 0;
                navigationToolbar.Visible = visible;
            }
            finally { chromeLayout.ResumeLayout(true); }
        }

        private async void InitializeWebView()
        {
            try
            {
                webView = new WebView2 { Dock = DockStyle.Fill };
                webView.Margin = Padding.Empty;
                webView.DefaultBackgroundColor = Color.FromArgb(15, 15, 15);
                // A dedicated layout row prevents the native bar from
                // overlapping YouTube. Fullscreen collapses that row.
                chromeLayout = new TableLayoutPanel {
                    Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 2,
                    Margin = Padding.Empty, Padding = Padding.Empty,
                    BackColor = Color.FromArgb(15, 15, 15)
                };
                chromeLayout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));
                chromeLayout.RowStyles.Add(new RowStyle(SizeType.Absolute, 38f));
                chromeLayout.RowStyles.Add(new RowStyle(SizeType.Percent, 100f));
                this.Controls.Add(chromeLayout);
                chromeLayout.Controls.Add(webView, 0, 1);
                // Navigation is host-owned, not injected into YouTube's masthead.
                SetupNavigationToolbar();

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
                    "--enable-zero-copy " +
                    "--high-dpi-support=1 " +
                    "--enable-font-antialiasing " +
                    "--force-color-profile=srgb";

                // Clean control case: no custom Chromium memory/GPU flags,
                // no production WebView profile, no mod injections/filters.
                var envOptions = options.UnmodifiedWebViewProbe
                    ? new CoreWebView2EnvironmentOptions()
                    : new CoreWebView2EnvironmentOptions(chromiumArgs) {
                        AreBrowserExtensionsEnabled = true
                    };
                var browserProfile = options.UnmodifiedWebViewProbe
                    ? Path.Combine(appDataDir, "diagnostic-unmodified")
                    : appDataDir;
                var env = await CoreWebView2Environment.CreateAsync(null, browserProfile, envOptions);
                await webView.EnsureCoreWebView2Async(env);
                // Install a verified, pinned, locally packaged MV3 extension
                // before the first page navigates. It belongs ONLY to this
                // application's WebView2 profile (not Windows/Edge globally).
                if (!options.UnmodifiedWebViewProbe)
                    await InitializeOpenSourceAdblockAsync();
                if (options.AdblockExtensionProbe &&
                    Interlocked.Read(ref ubolExtensionEnabled) != 1)
                    throw new InvalidOperationException("UBOL_BROWSER_EXTENSION_NOT_ENABLED");
                if (options.FloatingFixtureProbe)
                {
                    // Test-only virtual HTTPS origin, resolved entirely from local files.
                    // It exercises real WebView2 video compositing and native window moves
                    // even when YouTube rejects anonymous datacenter playback.
                    var fixtureRoot = Path.Combine(AppContext.BaseDirectory, "fixtures");
                    if (!File.Exists(Path.Combine(fixtureRoot, "watch.html")))
                        throw new FileNotFoundException("Offline playback fixture is missing");
                    webView.CoreWebView2.SetVirtualHostNameToFolderMapping(
                        "tizentube-fixture.invalid", fixtureRoot,
                        CoreWebView2HostResourceAccessKind.DenyCors);
                }
                webView.CoreWebView2.HistoryChanged += (sender, eventArgs) => UpdateNavigationToolbar();
                webView.CoreWebView2.SourceChanged += (sender, eventArgs) => UpdateNavigationToolbar();
                webView.CoreWebView2.DocumentTitleChanged += (sender, eventArgs) => UpdateNavigationToolbar();
                UpdateNavigationToolbar();

                ConfigureWebViewSettings();
                SetupFloatingAccelerators();
                SetupLifecycleDiagnostics();
                // Diagnostic-only unmodified WebView2 isolates whether native
                // YouTube's playback fails without any of our interception.
                // Not an undocumented production fallback or a bypass of login.
                // uBOL explicitly advises against running two blockers.
                // Retain limited native URL filters only if uBOL could not
                // initialize on the current WebView2 runtime.
                if (!options.UnmodifiedWebViewProbe &&
                    Interlocked.Read(ref ubolExtensionEnabled) != 1)
                    SetupNetworkAdBlocker();
                if (Interlocked.Read(ref ubolExtensionEnabled) == 1)
                    await webView.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(
                        "window.__TT_EXTERNAL_ADBLOCK__='uBlock Origin Lite';");
                SetupFullscreenHandling();
                SetupIpcBridge();
                SetupAdblockDiagnosticMenu();
                if (!options.UnmodifiedWebViewProbe) await InjectModsAsync();

                if (options.FloatingVisualProbe)
                {
                    webView.CoreWebView2.NavigationCompleted += async (sender, nav) =>
                    {
                        if (!nav.IsSuccess || floatingVisualProbeStarted || IsDisposed) return;
                        floatingVisualProbeStarted = true;
                        await CaptureFloatingVisualProbeAsync();
                    };
                }
                if (options.FloatingCycleProbe)
                {
                    webView.CoreWebView2.NavigationCompleted += async (sender, nav) =>
                    {
                        if (!nav.IsSuccess || floatingCycleProbeStarted || IsDisposed) return;
                        floatingCycleProbeStarted = true;
                        await CaptureFloatingCycleProbeAsync();
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
                if (options.PreferencesSetupProbe || options.PreferencesRestartProbe || options.NavigationBackProbe)
                {
                    webView.CoreWebView2.NavigationCompleted += async (sender, nav) =>
                    {
                        if (!nav.IsSuccess || preferencesProbeStarted || IsDisposed) return;
                        preferencesProbeStarted = true;
                        await CapturePreferencesAndNavigationProbeAsync();
                    };
                }

                if (options.KeyboardShortcutsProbe)
                {
                    webView.CoreWebView2.NavigationCompleted += async (sender, nav) =>
                    {
                        if (!nav.IsSuccess || keyboardProbeStarted || IsDisposed) return;
                        keyboardProbeStarted = true;
                        await CaptureKeyboardShortcutsProbeAsync();
                    };
                }

                if (options.NavigationPlaybackProbe)
                {
                    webView.CoreWebView2.NavigationCompleted += async (sender, nav) =>
                    {
                        if (!nav.IsSuccess || playbackJourneyProbeStarted || IsDisposed) return;
                        playbackJourneyProbeStarted = true;
                        await CaptureNavigationPlaybackProbeAsync();
                    };
                }

                string navUrl = options.FloatingFixtureProbe
                    ? "https://tizentube-fixture.invalid/watch.html"
                    : (!string.IsNullOrEmpty(options.InitialUrl) ? options.InitialUrl : GetDefaultLaunchUrl());
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
            // Leave WM_NCCALCSIZE to WinForms. Forcing a zero nonclient area
            // on a thick-frame window caused a native caption to reappear in
            // preview.14 on real hardware. No WS_THICKFRAME is set anymore.
            if (m.Msg == WmHotKey && m.WParam.ToInt32() == FloatingHotKeyId)
            {
                Interlocked.Increment(ref floatingHotKeyWindowsTriggered);
                _ = ToggleFloatingWindowAsync();
                return;
            }
            base.WndProc(ref m);
            ApplyBorderlessHitTest(ref m);
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
                                "Boolean(window.__TIZENTUBE_LOADER__ && " +
                                "(window.__TT_EXTERNAL_ADBLOCK__ || window.__TIZENTUBE_LOADER__.adblock?.options.enabled))");
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

        private async Task InitializeOpenSourceAdblockAsync()
        {
            const string pinnedVersion = "2026.1026.1812";
            var addonRoot = Path.Combine(AppContext.BaseDirectory, "extensions", "ubol");
            var manifest = Path.Combine(addonRoot, "manifest.json");
            try
            {
                if (!File.Exists(manifest))
                {
                    Console.Error.WriteLine("[AdBlock] Packaged uBlock Origin Lite missing; limited fallback only");
                    return;
                }
                // Never load a differently versioned or user-replaced addon.
                using (var json = System.Text.Json.JsonDocument.Parse(File.ReadAllText(manifest)))
                {
                    if (json.RootElement.GetProperty("version").GetString() != pinnedVersion)
                        throw new InvalidDataException("uBOL manifest version mismatch");
                }
                var installed = await webView.CoreWebView2.Profile.GetBrowserExtensionsAsync();
                var active = installed.FirstOrDefault(ext =>
                    ext.Name.Contains("uBlock Origin Lite", StringComparison.OrdinalIgnoreCase));
                string stamp = Path.Combine(appDataDir, "ubol-pinned-version.txt");
                bool mustInstall = active == null
                    || !File.Exists(stamp) || File.ReadAllText(stamp).Trim() != pinnedVersion;
                if (mustInstall)
                {
                    active = await webView.CoreWebView2.Profile.AddBrowserExtensionAsync(addonRoot);
                    Directory.CreateDirectory(appDataDir);
                    File.WriteAllText(stamp, pinnedVersion);
                }
                if (!active.IsEnabled) await active.EnableAsync(true);
                var verified = await webView.CoreWebView2.Profile.GetBrowserExtensionsAsync();
                if (!verified.Any(ext => ext.Id == active.Id && ext.IsEnabled))
                    throw new InvalidOperationException("uBOL extension not enabled after installation");
                Interlocked.Exchange(ref ubolExtensionEnabled, 1);
                Console.WriteLine("[AdBlock] uBlock Origin Lite " + pinnedVersion + " enabled in WebView2 profile");
            }
            catch (Exception error)
            {
                Interlocked.Exchange(ref ubolExtensionEnabled, 0);
                Console.Error.WriteLine("[AdBlock] uBOL failed; limited fallback: " + error.Message);
            }
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
                    "window.__ttFloating?.stop();" +
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
                UpdateNavigationToolbarVisibility();
                _ = webView?.CoreWebView2?.ExecuteScriptAsync(
                    "window.__ttNativeFullscreen = true;");
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
                {
                    MaximizedBounds = Screen.FromControl(this).WorkingArea;
                    this.WindowState = FormWindowState.Maximized;
                }
                // Do not restore Minimized: a user exiting video fullscreen
                // should always see a usable window.
                this.ResumeLayout();
                UpdateNavigationToolbarVisibility();
                _ = webView?.CoreWebView2?.ExecuteScriptAsync(
                    "window.__ttNativeFullscreen = false; window.dispatchEvent(new Event('resize'));");
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
                    FormBorderStyle = FormBorderStyle.None;
                    var area = Screen.FromControl(this).WorkingArea;
                    int w = Math.Min(500, Math.Max(330, area.Width - 35));
                    int h = (int)Math.Round(w * 9.0 / 16.0) + 38;
                    Bounds = new Rectangle(area.Right - w - 22,
                        area.Bottom - h - 22, w, h);
                    TopMost = true;
                    navigationToolbar?.SetFloatingMode(true);
                    UpdateNavigationToolbar();
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
                    {
                        MaximizedBounds = Screen.FromControl(this).WorkingArea;
                        WindowState = FormWindowState.Maximized;
                    }
                    navigationToolbar?.SetFloatingMode(false);
                    UpdateNavigationToolbar();
                }
            }
            finally
            {
                UpdateNavigationToolbarVisibility();
                ResumeLayout();
            }
        }

        private async Task<string> ClickVideoLinkWithTrustedPointerAsync(
            string selector, string excludeId, string method)
        {
            // HTMLElement.click() can update YouTube's SPA URL without ever
            // initializing its media player. Use a real CDP pointer event,
            // including viewport hit-testing, as we already do for theater.
            try
            {
                string selectors = System.Text.Json.JsonSerializer.Serialize(selector);
                string excluded = System.Text.Json.JsonSerializer.Serialize(excludeId ?? "");
                string script = "(() => {const nodes=[...document.querySelectorAll(" + selectors + ")];" +
                    "const a=nodes.find(e=>{try{const u=new URL(e.href);" +
                    "return u.pathname==='/watch' && !!u.searchParams.get('v') && " +
                    "u.searchParams.get('v')!==" + excluded + "}catch{return false}});" +
                    "if(!a)return null;a.scrollIntoView({block:'center'});" +
                    "const r=a.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;" +
                    "const hit=document.elementFromPoint(x,y);" +
                    "if(r.width<10||r.height<10||!hit||!(a===hit||a.contains(hit)))return null;" +
                    "return {id:new URL(a.href).searchParams.get('v'),x,y};})()";
                string response = await webView.CoreWebView2.ExecuteScriptAsync(script);
                if (response == "null") return "{\"clicked\":false}";
                using (var json = System.Text.Json.JsonDocument.Parse(response))
                {
                    var item = json.RootElement;
                    string id = item.GetProperty("id").GetString() ?? "";
                    double x = item.GetProperty("x").GetDouble();
                    double y = item.GetProperty("y").GetDouble();
                    if (id.Length != 11 || x < 0 || y < 0 ||
                        x >= webView.Width || y >= webView.Height)
                        return "{\"clicked\":false}";
                    string move = System.Text.Json.JsonSerializer.Serialize(new {
                        type = "mouseMoved", x, y });
                    string press = System.Text.Json.JsonSerializer.Serialize(new {
                        type = "mousePressed", x, y, button = "left", clickCount = 1 });
                    string release = System.Text.Json.JsonSerializer.Serialize(new {
                        type = "mouseReleased", x, y, button = "left", clickCount = 1 });
                    await webView.CoreWebView2.CallDevToolsProtocolMethodAsync(
                        "Input.dispatchMouseEvent", move);
                    await Task.Delay(180);
                    await webView.CoreWebView2.CallDevToolsProtocolMethodAsync(
                        "Input.dispatchMouseEvent", press);
                    await webView.CoreWebView2.CallDevToolsProtocolMethodAsync(
                        "Input.dispatchMouseEvent", release);
                    return System.Text.Json.JsonSerializer.Serialize(new {
                        clicked = true, id, method = "trusted-" + method });
                }
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine("[Host Journey Click] " + ex.Message);
                return "{\"clicked\":false}";
            }
        }

        private async Task CaptureNavigationPlaybackProbeAsync()
        {
            // Acceptance: start from HOME, click an actual feed thumbnail, play
            // and then click a different related video. No test-only watch URL.
            // Only anonymous numerical media state is exported.
            try
            {
                string folder = Path.GetDirectoryName(options.TelemetryFilePath ?? "");
                if (string.IsNullOrEmpty(folder)) folder = appDataDir;
                Directory.CreateDirectory(folder);
                await Task.Delay(13000);
                if (IsDisposed || webView?.CoreWebView2 == null) return;

                string home = "(() => ({path:location.pathname," +
                    "ytApp:!!document.querySelector('ytd-app')," +
                    "feedLinks:document.querySelectorAll(" +
                    "'ytd-rich-grid-media a#thumbnail[href*=\\\"watch\\\"],ytd-video-renderer a#video-title').length}))()";
                File.WriteAllText(Path.Combine(folder, "journey-home.json"),
                    await webView.CoreWebView2.ExecuteScriptAsync(home));

                string firstClickResult = await ClickVideoLinkWithTrustedPointerAsync(
                    "ytd-rich-grid-media a#thumbnail,ytd-video-renderer a#video-title", "", "feed");
                if (firstClickResult.Contains("\"clicked\":false"))
                {
                    // A signed-out YouTube home can legitimately contain no
                    // recommendations. Search still needs to return clickable
                    // content and a playable video.
                    await webView.CoreWebView2.ExecuteScriptAsync(
                        "location.assign('https://www.youtube.com/results?search_query=big+buck+bunny')");
                    await Task.Delay(12000);
                    firstClickResult = await ClickVideoLinkWithTrustedPointerAsync(
                        "ytd-video-renderer a#video-title,ytd-video-renderer a#thumbnail", "", "search");
                }
                File.WriteAllText(Path.Combine(folder, "journey-first-click.json"), firstClickResult);

                await Task.Delay(14000);
                string media = "(() => {const v=document.querySelector('video.html5-main-video');" +
                    "const id=new URL(location.href).searchParams.get('v');" +
                    "const p=window.ytInitialPlayerResponse?.playabilityStatus;" +
                    "const message=document.querySelector('yt-player-error-message-renderer,.ytp-error');" +
                    "return {id,watch:location.pathname==='/watch',readyState:v?.readyState??0," +
                    "width:v?.videoWidth??0,time:v?.currentTime??0,paused:v?.paused??true," +
                    "duration:Number.isFinite(v?.duration)?v.duration:0," +
                    "error:!!document.querySelector('.ytp-error')," +
                    "mediaErrorCode:v?.error?.code??null," +
                    "playabilityStatus:p?.status??null," +
                    "playabilityReason:String(p?.reason||'').slice(0,160)," +
                    "errorLabel:(message?.textContent||'').slice(0,160)};})()";
                // A click can reach /watch with playback paused due autoplay
                // policies. Trigger the same player play control as a user.
                await webView.CoreWebView2.ExecuteScriptAsync(
                    "document.querySelector('video.html5-main-video')?.play()?.catch(()=>{});");
                await Task.Delay(2800);
                File.WriteAllText(Path.Combine(folder, "journey-first-before.json"),
                    await webView.CoreWebView2.ExecuteScriptAsync(media));
                await Task.Delay(3900);
                File.WriteAllText(Path.Combine(folder, "journey-first-after.json"),
                    await webView.CoreWebView2.ExecuteScriptAsync(media));
                // Guest-only screenshot for diagnosing YouTube's challenge UI
                // when a Windows cloud runner receives no playable stream.
                using (var capture = File.Create(Path.Combine(folder, "journey-first-frame.png")))
                    await webView.CoreWebView2.CapturePreviewAsync(
                        CoreWebView2CapturePreviewImageFormat.Png, capture);

                string firstId = "";
                try
                {
                    using (var parsed = System.Text.Json.JsonDocument.Parse(firstClickResult))
                        firstId = parsed.RootElement.GetProperty("id").GetString() ?? "";
                }
                catch { }
                string secondClickResult = await ClickVideoLinkWithTrustedPointerAsync(
                    "ytd-compact-video-renderer a#thumbnail,ytd-watch-next-secondary-results-renderer a#thumbnail",
                    firstId, "related");
                if (secondClickResult.Contains("\"clicked\":false"))
                {
                    // Return to discovery and click another *actual* result.
                    await webView.CoreWebView2.ExecuteScriptAsync("history.back()");
                    await Task.Delay(8000);
                    secondClickResult = await ClickVideoLinkWithTrustedPointerAsync(
                        "ytd-video-renderer a#video-title,ytd-rich-grid-media a#thumbnail",
                        firstId, "back-to-results");
                }
                File.WriteAllText(Path.Combine(folder, "journey-second-click.json"), secondClickResult);
                await Task.Delay(15000);
                await webView.CoreWebView2.ExecuteScriptAsync(
                    "document.querySelector('video.html5-main-video')?.play()?.catch(()=>{});");
                await Task.Delay(2900);
                File.WriteAllText(Path.Combine(folder, "journey-second-before.json"),
                    await webView.CoreWebView2.ExecuteScriptAsync(media));
                await Task.Delay(4000);
                File.WriteAllText(Path.Combine(folder, "journey-second-after.json"),
                    await webView.CoreWebView2.ExecuteScriptAsync(media));
                using (var capture = File.Create(Path.Combine(folder, "journey-second-frame.png")))
                    await webView.CoreWebView2.CapturePreviewAsync(
                        CoreWebView2CapturePreviewImageFormat.Png, capture);
                Console.WriteLine("[Host Journey] Guest home/feed/video-to-video evidence exported");
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine("[Host Journey] " + ex.Message);
            }
        }

        private async Task CaptureKeyboardShortcutsProbeAsync()
        {
            // CI-only synthetic guest profile; export numerical media state only.
            // SendKeys drives *real* Windows keyboard input into WebView2.
            try
            {
                await Task.Delay(15000); // Allow YouTube's real player to load.
                if (IsDisposed || webView?.CoreWebView2 == null) return;
                string folder = Path.GetDirectoryName(options.TelemetryFilePath ?? "");
                if (string.IsNullOrEmpty(folder)) folder = appDataDir;
                Directory.CreateDirectory(folder);

                string setup = "(() => {const v=document.querySelector('video.html5-main-video');" +
                    "if(!v||v.readyState<2||!Number.isFinite(v.duration)||v.duration<90)return null;" +
                    "v.pause();v.currentTime=60;return {ready:true};})()";
                File.WriteAllText(Path.Combine(folder, "keyboard-setup.json"),
                    await webView.CoreWebView2.ExecuteScriptAsync(setup));
                await Task.Delay(1200);

                string snapshot = "(() => {const v=document.querySelector('video.html5-main-video');" +
                    "return v?{time:v.currentTime,paused:v.paused,readyState:v.readyState}:null;})()";
                File.WriteAllText(Path.Combine(folder, "keyboard-before.json"),
                    await webView.CoreWebView2.ExecuteScriptAsync(snapshot));
                Activate();
                webView.Focus();

                SendKeys.SendWait("{RIGHT}");
                await Task.Delay(950);
                File.WriteAllText(Path.Combine(folder, "keyboard-after-right.json"),
                    await webView.CoreWebView2.ExecuteScriptAsync(snapshot));

                SendKeys.SendWait("{LEFT}");
                await Task.Delay(950);
                File.WriteAllText(Path.Combine(folder, "keyboard-after-left.json"),
                    await webView.CoreWebView2.ExecuteScriptAsync(snapshot));

                // Ensure a paused baseline. The player could auto-resume on seek.
                await webView.CoreWebView2.ExecuteScriptAsync(
                    "document.querySelector('video.html5-main-video')?.pause()");
                await Task.Delay(150);
                File.WriteAllText(Path.Combine(folder, "keyboard-before-space.json"),
                    await webView.CoreWebView2.ExecuteScriptAsync(snapshot));
                webView.Focus();
                SendKeys.SendWait(" ");
                await Task.Delay(1100);
                File.WriteAllText(Path.Combine(folder, "keyboard-after-space.json"),
                    await webView.CoreWebView2.ExecuteScriptAsync(snapshot));
                Console.WriteLine("[Host Keyboard] Windows key input probe saved");
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine("[Host Keyboard Probe] " + ex.Message);
            }
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
                // Exercise the actual button -> JS -> IPC -> native path,
                // rather than passing CI by directly resizing WinForms.
                string buttonClick = await webView.CoreWebView2.ExecuteScriptAsync(
                    "(() => {const b=document.getElementById('tizentube-native-pip');" +
                    "const v=document.querySelector('video.html5-main-video');" +
                    "if(!b||!v||v.readyState<2||v.videoWidth<1)return false;" +
                    "b.click();return true;})()");
                File.WriteAllText(Path.Combine(folder, "floating-button-click.json"), buttonClick);
                await Task.Delay(2300);
                string after = await webView.CoreWebView2.ExecuteScriptAsync(
                    "window.__ttFloating?.diagnostics() || null");
                File.WriteAllText(Path.Combine(folder, "floating-after.json"), after);
                if (nativeFloatingActive)
                {
                    using (var stream = File.Create(Path.Combine(folder, "floating-preview.png")))
                        await webView.CoreWebView2.CapturePreviewAsync(
                            CoreWebView2CapturePreviewImageFormat.Png, stream);
                }
                Console.WriteLine("[Host PiP] Local screenshot and media layout probe saved");
                await ToggleFloatingWindowAsync(true);
            }
            catch (Exception ex) { Console.Error.WriteLine("[Host PiP Probe] " + ex.Message); }
        }

        private string GetDefaultLaunchUrl()
        {
            try
            {
                if (File.Exists(lastVideoSessionFile))
                {
                    string json = File.ReadAllText(lastVideoSessionFile);
                    using (var doc = System.Text.Json.JsonDocument.Parse(json))
                    {
                        var root = doc.RootElement;
                        if (root.TryGetProperty("id", out var idProp))
                        {
                            string id = idProp.GetString();
                            if (!string.IsNullOrEmpty(id) && id.Length == 11)
                            {
                                int pos = 0;
                                if (root.TryGetProperty("position", out var posProp))
                                    pos = posProp.GetInt32();
                                return $"https://www.youtube.com/watch?v={id}&t={Math.Max(0, pos)}s";
                            }
                        }
                    }
                }
            }
            catch { }
            return "https://www.youtube.com";
        }

        private async Task CaptureFloatingCycleProbeAsync()
        {
            try
            {
                string folder = Path.GetDirectoryName(options.TelemetryFilePath ?? "");
                if (string.IsNullOrEmpty(folder)) folder = appDataDir;
                Directory.CreateDirectory(folder);

                string probeScript = "(() => {const v=document.querySelector('video.html5-main-video');" +
                    "const f=document.querySelector('ytd-watch-flexy');" +
                    "const floatDiag=window.__ttFloating?.diagnostics?.() || null;" +
                    "return {readyState:v?.readyState??-1,videoWidth:v?.videoWidth??0," +
                    "currentTime:v?.currentTime??0,paused:v?.paused??true," +
                    "theater:f?f.hasAttribute('theater'):false," +
                    "floating:floatDiag?.active??false," +
                    "playerInBody:floatDiag?.playerInBody??false," +
                    "fullscreen:!!(document.fullscreenElement || document.querySelector('.ytp-fullscreen') || window.__ttNativeFullscreen)};})()";

                var pixelChecks = new Dictionary<string, string>();

                // A decoded mediaWidth/time-only check can miss a black GPU
                // compositor surface. Use actual WebView2 screenshots of the
                // locally generated colored frames on every native transition.
                async Task CaptureVisibleFixtureAsync(string stage)
                {
                    if (!options.FloatingFixtureProbe) return;
                    string screenshotPath = Path.Combine(folder, $"cycle-{stage}.png");
                    using (var stream = File.Create(screenshotPath))
                        await webView.CoreWebView2.CapturePreviewAsync(
                            CoreWebView2CapturePreviewImageFormat.Png, stream);
                    using (var image = new Bitmap(screenshotPath))
                    {
                        var center = image.GetPixel(image.Width / 2, image.Height / 2);
                        if (center.R + center.G + center.B < 30)
                            throw new InvalidOperationException(
                                $"OFFLINE_MEDIA_BLACK_CENTER:{stage}:{center.R},{center.G},{center.B}");
                        pixelChecks[stage] = $"R={center.R},G={center.G},B={center.B}";
                    }
                }

                await Task.Delay(10000);
                if (IsDisposed || webView?.CoreWebView2 == null) return;

                // 1. Normal
                string s1 = await webView.CoreWebView2.ExecuteScriptAsync(probeScript);
                File.WriteAllText(Path.Combine(folder, "cycle-01-normal.json"), s1);
                await CaptureVisibleFixtureAsync("01-normal");

                // 2. Theater
                await webView.CoreWebView2.ExecuteScriptAsync(
                    "(() => { const f=document.querySelector('ytd-watch-flexy'); " +
                    "if (f && !f.hasAttribute('theater')) { " +
                    "  const b=document.querySelector('.ytp-size-button'); b?.click(); " +
                    "} })()");
                await Task.Delay(1200);
                string s2 = await webView.CoreWebView2.ExecuteScriptAsync(probeScript);
                File.WriteAllText(Path.Combine(folder, "cycle-02-theater.json"), s2);
                await CaptureVisibleFixtureAsync("02-theater");

                // 3. Floating
                await ToggleFloatingWindowAsync(false);
                await Task.Delay(1500);
                string s3 = await webView.CoreWebView2.ExecuteScriptAsync(probeScript);
                File.WriteAllText(Path.Combine(folder, "cycle-03-floating.json"), s3);
                await CaptureVisibleFixtureAsync("03-floating");

                // 4. Fullscreen
                await webView.CoreWebView2.ExecuteScriptAsync(
                    "window.__ttFloating?.stop(); window.__ttNativeFullscreen = true; " +
                    "try { const b = document.querySelector('.ytp-fullscreen-button'); if (b) b.click(); } catch (_) {}");
                webPlayerFullscreen = true;
                UpdateNativeImmersiveMode();
                await Task.Delay(1500);
                string s4 = await webView.CoreWebView2.ExecuteScriptAsync(probeScript);
                File.WriteAllText(Path.Combine(folder, "cycle-04-fullscreen.json"), s4);
                await CaptureVisibleFixtureAsync("04-fullscreen");

                // 5. Return
                await webView.CoreWebView2.ExecuteScriptAsync(
                    "window.__ttNativeFullscreen = false; " +
                    "try { if (document.fullscreenElement) document.exitFullscreen(); } catch (_) {}");
                webPlayerFullscreen = false;
                UpdateNativeImmersiveMode();
                await Task.Delay(1500);
                string s5 = await webView.CoreWebView2.ExecuteScriptAsync(probeScript);
                File.WriteAllText(Path.Combine(folder, "cycle-05-return.json"), s5);
                await CaptureVisibleFixtureAsync("05-return");

                var summary = new {
                    success = true,
                    pixelChecks = pixelChecks,
                    step1_normal = System.Text.Json.JsonDocument.Parse(s1).RootElement,
                    step2_theater = System.Text.Json.JsonDocument.Parse(s2).RootElement,
                    step3_floating = System.Text.Json.JsonDocument.Parse(s3).RootElement,
                    step4_fullscreen = System.Text.Json.JsonDocument.Parse(s4).RootElement,
                    step5_return = System.Text.Json.JsonDocument.Parse(s5).RootElement
                };
                File.WriteAllText(Path.Combine(folder, "floating-cycle-summary.json"),
                    System.Text.Json.JsonSerializer.Serialize(summary));
                Console.WriteLine("[Host Cycle Probe] P0 Floating cycle probe completed successfully");
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine("[Host Cycle Probe] Error: " + ex.Message);
            }
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

                        string layoutProbeScript = "(() => { " +
                            "const style = document.getElementById('tizentube-ui-styles'); " +
                            "const comments = document.querySelector('ytd-comments, #comments'); " +
                            "const pip = document.getElementById('tizentube-native-pip'); " +
                            "const cc = document.querySelector('.ytp-subtitles-button'); " +
                            "const set = document.querySelector('.ytp-settings-button'); " +
                            "return { " +
                            "  stylesInjected: !!style, " +
                            "  devicePixelRatio: window.devicePixelRatio || 1, " +
                            "  commentsElementFound: !!comments, " +
                            "  pipVisible: pip ? window.getComputedStyle(pip).display !== 'none' : false, " +
                            "  pipBetweenCaptionsAndSettings: (pip && cc && set) ? " +
                            "    ((pip.compareDocumentPosition(set) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0 && " +
                            "     (cc.compareDocumentPosition(pip) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0) : true " +
                            "}; })()";
                        File.WriteAllText(Path.Combine(folder, "hidpi-layout-probe.json"),
                            await webView.CoreWebView2.ExecuteScriptAsync(layoutProbeScript));

                        string featuresProbeScript = "(() => { " +
                            "const l = window.__TIZENTUBE_LOADER__; " +
                            "const ad = l?.adblock; " +
                            "const sb = l?.sponsorblock; " +
                            "const da = l?.dearrow; " +
                            "const adStyle = document.getElementById('tizentube-adblock-styles'); " +
                            "const uiStyle = document.getElementById('tizentube-ui-styles'); " +
                            "return { " +
                            "  adblock: { " +
                            "    loaded: Boolean(ad), " +
                            "    enabled: Boolean(ad && ad.options && ad.options.enabled === true), " +
                            "    stylesheetInjected: Boolean(adStyle), " +
                            "    rulesCount: (adStyle && adStyle.sheet && adStyle.sheet.cssRules) ? adStyle.sheet.cssRules.length : 0 " +
                            "  }, " +
                            "  sponsorblock: { " +
                            "    loaded: Boolean(sb), " +
                            "    enabled: Boolean(sb && sb.options && sb.options.enabled === true), " +
                            "    autoSkip: Boolean(sb && sb.options && sb.options.autoSkip === true), " +
                            "    categoriesConfigured: Boolean(sb && sb.options && Array.isArray(sb.options.categories) && sb.options.categories.length > 0) " +
                            "  }, " +
                            "  dearrow: { " +
                            "    loaded: Boolean(da), " +
                            "    enabled: Boolean(da && da.options && da.options.enabled === true) " +
                            "  }, " +
                            "  hidpi: { " +
                            "    stylesInjected: Boolean(uiStyle), " +
                            "    devicePixelRatio: window.devicePixelRatio || 1, " +
                            "    fontSmoothingConfigured: Boolean(uiStyle) " +
                            "  } " +
                            "}; })()";
                        File.WriteAllText(Path.Combine(folder, "features-probe.json"),
                            await webView.CoreWebView2.ExecuteScriptAsync(featuresProbeScript));
                    }
                }
                string persisted = File.Exists(theaterPreferenceFile)
                    ? File.ReadAllText(theaterPreferenceFile) : "NOT_SAVED";
                File.WriteAllText(Path.Combine(folder, "theater-native-preference.txt"), persisted);
                Console.WriteLine("[Host Theater] Local DOM and preference probe saved");
            }
            catch (Exception ex) { Console.Error.WriteLine("[Host Theater Probe] " + ex.Message); }
        }

        private async Task CapturePreferencesAndNavigationProbeAsync()
        {
            // Tests run exclusively on isolated Windows-hosted GitHub runners.
            // No tokens, cookies or account data in the exported artifacts.
            try
            {
                await Task.Delay(11000);
                if (IsDisposed || webView?.CoreWebView2 == null) return;
                string folder = Path.GetDirectoryName(options.TelemetryFilePath ?? "");
                if (string.IsNullOrEmpty(folder)) folder = appDataDir;
                Directory.CreateDirectory(folder);
                if (options.PreferencesSetupProbe)
                {
                    string write = "(() => { const u=window.__TIZENTUBE_LOADER__?.ui;" +
                        "if (!u?.settingsModal?.getSettings || !u?.savePreferences) return false;" +
                        "const s=u.settingsModal.getSettings();" +
                        "s.ui.highContrast=true; s.sponsorblock.autoSkip=false;" +
                        "s.playback.defaultSpeed=1.5;" +
                        "u.settingsModal.loadSettings(s);u.applySettings(s);u.savePreferences(s);" +
                        "return true; })()";
                    File.WriteAllText(Path.Combine(folder, "preferences-setup.json"),
                        await webView.CoreWebView2.ExecuteScriptAsync(write));
                    await Task.Delay(450);
                }
                if (options.PreferencesRestartProbe)
                {
                    string read = "(() => {const u=window.__TIZENTUBE_LOADER__?.ui;" +
                        "if (!u?.settingsModal?.getSettings) return null;const s=u.settingsModal.getSettings();" +
                        "return {highContrast:s.ui.highContrast," +
                        "autoSkip:s.sponsorblock.autoSkip,defaultSpeed:s.playback.defaultSpeed," +
                        "hostPrefsPresent:!!window.__TIZENTUBE_INITIAL_PREFERENCES__};})()";
                    File.WriteAllText(Path.Combine(folder, "preferences-restart.json"),
                        await webView.CoreWebView2.ExecuteScriptAsync(read));
                }
                if (options.NavigationBackProbe)
                {
                    // Exercise the native toolbar (not an in-page DOM element).
                    string navTest = "(() => {const original=location.pathname+location.search;" +
                        "history.pushState({ttTest:true},'', '/results?search_query=tizentube-ci-back');" +
                        "return {original,pushed:location.pathname};})()";
                    string initial = await webView.CoreWebView2.ExecuteScriptAsync(navTest);
                    await Task.Delay(500);
                    UpdateNavigationToolbar();
                    bool nativeToolbarPresent = navigationToolbar != null &&
                        navigationToolbar.Visible;
                    bool nativeToolbarEnabled = navigationToolbar?.BackEnabled == true;
                    bool nativeToolbarClicked = navigationToolbar?.InvokeBackForProbe() == true;
                    // Windows-native raster proof: catch white HTML-sized controls.
                    if (navigationToolbar != null && navigationToolbar.Width >= 110)
                    {
                        using (var bitmap = new Bitmap(navigationToolbar.Width, navigationToolbar.Height))
                        {
                            navigationToolbar.DrawToBitmap(bitmap,
                                new Rectangle(Point.Empty, bitmap.Size));
                            bitmap.Save(Path.Combine(folder, "navigation-toolbar.png"),
                                System.Drawing.Imaging.ImageFormat.Png);
                        }
                    }
                    string now = "null";
                    string nativePath = "";
                    // Record initial evidence BEFORE page transition queries.
                    // This prevents a slow Youtube SPA transition from
                    // consuming the smoke timeout without any diagnostic.
                    string proofFile = Path.Combine(folder, "navigation-back.json");
                    File.WriteAllText(proofFile,
                        "{\"request\":" + initial + ",\"result\":null,\"nativeSource\":\"\"," +
                        "\"toolbarPresent\":" + (nativeToolbarPresent ? "true" : "false") +
                        ",\"toolbarEnabled\":" + (nativeToolbarEnabled ? "true" : "false") +
                        ",\"toolbarClicked\":" + (nativeToolbarClicked ? "true" : "false") + "}");
                    // Do not ExecuteScriptAsync while YouTube navigates: on
                    // WebView2 this can hang until the smoke process exits.
                    // The native Source is observable even during transitions.
                    for (int attempt = 0; attempt < 14; attempt++)
                    {
                        await Task.Delay(350);
                        if (IsDisposed || webView?.CoreWebView2 == null) break;
                        Uri src = null;
                        try { src = new Uri(webView.CoreWebView2.Source); } catch { }
                        nativePath = src != null && src.Scheme == "https" &&
                            (src.Host == "youtube.com" || src.Host == "www.youtube.com")
                            ? src.PathAndQuery : "";
                        if (nativePath.StartsWith("/watch?", StringComparison.Ordinal)) break;
                    }
                    File.WriteAllText(proofFile,
                        "{\"request\":" + initial + ",\"result\":" + now +
                        ",\"nativeSource\":" + System.Text.Json.JsonSerializer.Serialize(nativePath) +
                        ",\"toolbarPresent\":" + (nativeToolbarPresent ? "true" : "false") +
                        ",\"toolbarEnabled\":" + (nativeToolbarEnabled ? "true" : "false") +
                        ",\"toolbarClicked\":" + (nativeToolbarClicked ? "true" : "false") + "}");
                }
            }
            catch (Exception ex) { Console.Error.WriteLine("[Host UI Probe] " + ex.Message); }
        }

        private async Task RestoreTheaterViaTrustedInputAsync(bool wanted)
        {
            if (webView?.CoreWebView2 == null || theaterRestoreInProgress ||
                nativeFloatingActive || options.HeadlessMode ||
                (DateTime.UtcNow - lastTheaterRestoreAttemptUtc).TotalMilliseconds < 2600) return;
            lastTheaterRestoreAttemptUtc = DateTime.UtcNow;
            theaterRestoreInProgress = true;
            bool restoringFlagSet = false;
            try
            {
                // Avoid a blind 4.9-second wait: restore at the first usable
                // video frame with a real, hit-tested click. We cannot mutate
                // 'theater' prematurely; that collapsed the player in E2E.
                string buttonPoint = "null";
                for (int check = 0; check < 40; check++)
                {
                    if (IsDisposed || webView?.CoreWebView2 == null || nativeFloatingActive) return;
                    buttonPoint = await webView.CoreWebView2.ExecuteScriptAsync(
                        "(() => {const b=document.querySelector('.ytp-size-button');" +
                        "const v=document.querySelector('video.html5-main-video');" +
                        "if(!b||!v||v.readyState<2||v.videoWidth<1)return null;" +
                        "const r=b.getBoundingClientRect();" +
                        "return r.width>5&&r.height>5?{x:r.left+r.width/2,y:r.top+r.height/2}:null;})()");
                    if (buttonPoint != "null") break;
                    await Task.Delay(50);
                }
                if (buttonPoint == "null") return;
                double mouseX, mouseY;
                using (var point = System.Text.Json.JsonDocument.Parse(buttonPoint))
                {
                    mouseX = point.RootElement.GetProperty("x").GetDouble();
                    mouseY = point.RootElement.GetProperty("y").GetDouble();
                }
                if (mouseX <= 0 || mouseY <= 0 ||
                    mouseX >= webView.Width || mouseY >= webView.Height) return;
                string move = System.Text.Json.JsonSerializer.Serialize(new {
                    type = "mouseMoved", x = mouseX, y = mouseY });
                await webView.CoreWebView2.CallDevToolsProtocolMethodAsync(
                    "Input.dispatchMouseEvent", move);
                await Task.Delay(60);
                string coords = await webView.CoreWebView2.ExecuteScriptAsync(
                    "(() => {const b=document.querySelector('.ytp-size-button');" +
                    "const f=document.querySelector('ytd-watch-flexy');" +
                    "const v=document.querySelector('video.html5-main-video');" +
                    "if(!b||!f||!v||location.pathname!=='/watch'||document.fullscreenElement||" +
                    "v.readyState<2||v.videoWidth<1)return null;" +
                    "const r=b.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;" +
                    "const hit=document.elementFromPoint(x,y);" +
                    "return {theater:f.hasAttribute('theater')," +
                    "safe:r.width>5&&r.height>5&&x>0&&y>0&&" +
                    "(hit===b||b.contains(hit)),x,y};})()");
                if (coords == "null") return;
                using (var json = System.Text.Json.JsonDocument.Parse(coords))
                {
                    var info = json.RootElement;
                    if (info.GetProperty("theater").GetBoolean() == wanted) return;
                    if (!info.GetProperty("safe").GetBoolean()) return;
                    double x = info.GetProperty("x").GetDouble();
                    double y = info.GetProperty("y").GetDouble();
                    await webView.CoreWebView2.ExecuteScriptAsync(
                        "window.__TT_RESTORING_THEATER = true");
                    restoringFlagSet = true;
                    string press = System.Text.Json.JsonSerializer.Serialize(new {
                        type = "mousePressed", x, y, button = "left", clickCount = 1 });
                    string release = System.Text.Json.JsonSerializer.Serialize(new {
                        type = "mouseReleased", x, y, button = "left", clickCount = 1 });
                    await webView.CoreWebView2.CallDevToolsProtocolMethodAsync(
                        "Input.dispatchMouseEvent", press);
                    await webView.CoreWebView2.CallDevToolsProtocolMethodAsync(
                        "Input.dispatchMouseEvent", release);
                    await Task.Delay(280);
                    string verified = await webView.CoreWebView2.ExecuteScriptAsync(
                        "(() => {if(document.fullscreenElement) return 'wrong-fullscreen';" +
                        "const f=document.querySelector('ytd-watch-flexy');return f?.hasAttribute('theater')=== " +
                        (wanted ? "true" : "false") + " ? 'restored':'unchanged';})()");
                    if (verified == "\"restored\"")
                        Interlocked.Increment(ref nativeTheaterRestored);
                    else if (verified == "\"wrong-fullscreen\"")
                        await webView.CoreWebView2.ExecuteScriptAsync(
                            "document.exitFullscreen?.().catch?.(()=>{})");
                }
            }
            catch (Exception ex) { Debug.WriteLine("[Host Theater Restore] " + ex.Message); }
            finally
            {
                if (restoringFlagSet && webView?.CoreWebView2 != null)
                    try { await webView.CoreWebView2.ExecuteScriptAsync(
                        "window.__TT_RESTORING_THEATER = false"); } catch { }
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

                    if (json.Contains("\"channel\":\"viewing:last-video\""))
                    {
                        if (Uri.TryCreate(args.Source, UriKind.Absolute, out Uri sender) &&
                            sender.Scheme == "https" &&
                            (sender.Host == "www.youtube.com" || sender.Host == "youtube.com") &&
                            json.Length < 1000)
                        {
                            string tmp = lastVideoSessionFile + ".tmp";
                            File.WriteAllText(tmp, json);
                            File.Move(tmp, lastVideoSessionFile, true);
                        }
                        return;
                    }

                    if (json.Contains("\"channel\":\"viewing:clear-last-video\""))
                    {
                        try { if (File.Exists(lastVideoSessionFile)) File.Delete(lastVideoSessionFile); } catch { }
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
                        // Native profile persists across executable updates,
                        // window close, and computer restart. Only the trusted
                        // first-party main document may update these settings.
                        try
                        {
                            if (!Uri.TryCreate(args.Source, UriKind.Absolute, out Uri sender) ||
                                sender.Scheme != "https" ||
                                (sender.Host != "www.youtube.com" && sender.Host != "youtube.com") ||
                                json.Length > 12000) return;
                            using (var parsed = System.Text.Json.JsonDocument.Parse(json))
                            {
                                var root = parsed.RootElement;
                                if (!root.TryGetProperty("channel", out var channel) ||
                                    channel.GetString() != "preferences:save" ||
                                    !root.TryGetProperty("payload", out var payload) ||
                                    payload.ValueKind != System.Text.Json.JsonValueKind.Object) return;
                            }
                            string prefsPath = Path.Combine(appDataDir, "user_preferences.json");
                            string tmp = prefsPath + ".tmp";
                            File.WriteAllText(tmp, json);
                            File.Move(tmp, prefsPath, true);
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
            // Never inject navigation buttons into youtube.com's own masthead.
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
            sb.AppendLine($"    \"ubolExtensionEnabled\": {Interlocked.Read(ref ubolExtensionEnabled)},");
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
