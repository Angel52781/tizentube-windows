using System.Runtime.InteropServices;
// GPL-3.0-only. Optional, explicit, verified updates for the portable Windows
// distribution. Never auto-install an Action artifact or an untagged branch.
using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using System.Windows.Forms;
using System.Reflection;
using Microsoft.Win32;

namespace TizenTubeWindows
{
    internal static class PortableUpdater
    {
        public static int CurrentPreview
        {
            get
            {
                try
                {
                    var infoVer = Assembly.GetExecutingAssembly().GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion;
                    if (!string.IsNullOrEmpty(infoVer))
                    {
                        var match = Regex.Match(infoVer, @"preview\.(\d+)");
                        if (match.Success && int.TryParse(match.Groups[1].Value, out int v))
                            return v;
                    }
                    var asmVer = Assembly.GetExecutingAssembly().GetName().Version;
                    if (asmVer != null && asmVer.Revision > 0)
                        return asmVer.Revision;
                }
                catch { }
                return 32; // fallback para preview.32
            }
        }
        private const string Api = "https://api.github.com/repos/Angel52781/tizentube-windows/releases?per_page=30";
        private const string ZipPrefix = "TizenTube-Windows-x64-v0.1.0-preview.";
        private const string PortableFolder = "TizenTube-Windows-x64";
        private static bool busy;

        private static HttpClient Client()
        {
            var client = new HttpClient { Timeout = TimeSpan.FromSeconds(30) };
            client.DefaultRequestHeaders.UserAgent.ParseAdd("TizenTube-Windows-Updater/0.1");
            client.DefaultRequestHeaders.Accept.ParseAdd("application/vnd.github+json");
            return client;
        }

        private static bool GithubReleaseUrl(string raw)
        {
            if (!Uri.TryCreate(raw, UriKind.Absolute, out var url)) return false;
            return url.Scheme == Uri.UriSchemeHttps &&
                (url.Host == "github.com" || url.Host == "api.github.com");
        }

        public static async Task CheckForUpdatesAsync(Form owner, bool silent)
        {
            if (busy || owner?.IsDisposed != false) return;
            busy = true;
            try
            {
                using (var client = Client())
                using (var releases = JsonDocument.Parse(await client.GetStringAsync(Api)))
                {
                    JsonElement chosen = default;
                    int newest = CurrentPreview;
                    foreach (var release in releases.RootElement.EnumerateArray())
                    {
                        if (release.GetProperty("draft").GetBoolean()) continue;
                        string tag = release.GetProperty("tag_name").GetString() ?? "";
                        var match = Regex.Match(tag, @"^v0\.1\.0-preview\.(\d+)$");
                        if (!match.Success || !int.TryParse(match.Groups[1].Value, out int candidate)
                            || candidate <= newest) continue;
                        newest = candidate;
                        chosen = release;
                    }
                    if (newest == CurrentPreview)
                    {
                        if (!silent) MessageBox.Show(owner,
                            "No hay versiones publicadas más recientes. Los cambios en PR de desarrollo no se instalan automáticamente.",
                            "Actualizaciones TizenTube", MessageBoxButtons.OK, MessageBoxIcon.Information);
                        return;
                    }
                    string zipName = ZipPrefix + newest + ".zip";
                    string zipUrl = null, checksumUrl = null;
                    foreach (var asset in chosen.GetProperty("assets").EnumerateArray())
                    {
                        string name = asset.GetProperty("name").GetString();
                        string address = asset.GetProperty("browser_download_url").GetString();
                        if (name == zipName) zipUrl = address;
                        if (name == "SHA256SUMS.txt") checksumUrl = address;
                    }
                    if (!GithubReleaseUrl(zipUrl) || !GithubReleaseUrl(checksumUrl))
                        throw new InvalidDataException("La versión publicada no incluye ZIP y SHA256SUMS verificables.");

                    string installed = Path.GetFullPath(Path.GetDirectoryName(Application.ExecutablePath));
                    bool portable = IsPortableInstallation(installed);
                    if (!portable)
                    {
                        var installChoice = MessageBox.Show(owner,
                            "TizenTube se está ejecutando fuera de una instalación permanente en tu equipo (por ejemplo, directamente en el Escritorio o en Descargas)." +
                            "\n\n¿Deseas instalar TizenTube en tu equipo?" +
                            "\n\n• Se instalará de forma limpia en tu carpeta de programas (%LocalAppData%\\Programs\\TizenTube)." +
                            "\n• Tendrás un único acceso directo limpio en tu Escritorio (sin carpetas sueltas de archivos)." +
                            "\n• Las futuras actualizaciones se aplicarán automáticamente con un solo clic.",
                            "Instalación de TizenTube",
                            MessageBoxButtons.YesNo, MessageBoxIcon.Question);

                        if (installChoice == DialogResult.Yes)
                        {
                            if (InstallApplication(installed, out string newExe, out string error))
                            {
                                MessageBox.Show(owner,
                                    "TizenTube se instaló correctamente en tu equipo." +
                                    "\nSe ha creado el acceso directo en tu Escritorio." +
                                    "\n\nSe abrirá ahora la versión instalada.",
                                    "Instalación completada", MessageBoxButtons.OK, MessageBoxIcon.Information);
                                Process.Start(new ProcessStartInfo(newExe) { UseShellExecute = true });
                                owner.Close();
                                return;
                            }
                            else
                            {
                                MessageBox.Show(owner, "No se pudo completar la instalación: " + error,
                                    "TizenTube", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                                return;
                            }
                        }
                        return;
                    }
                    var decision = MessageBox.Show(owner,
                        $"Versión nueva disponible: preview.{newest}\n" +
                        $"Versión instalada: preview.{CurrentPreview}\n\n" +
                        "¿Descargar e instalar aquí mismo? TizenTube se reiniciará y conservará la sesión y las preferencias.",
                        "Actualización disponible", MessageBoxButtons.YesNo, MessageBoxIcon.Question);
                    if (decision != DialogResult.Yes) return;
                    using (var progressWindow = new Form {
                        Text = "Actualizando TizenTube", Width = 420, Height = 153,
                        StartPosition = FormStartPosition.CenterParent,
                        FormBorderStyle = FormBorderStyle.FixedDialog,
                        MaximizeBox = false, MinimizeBox = false, ControlBox = false,
                        ShowInTaskbar = false
                    })
                    {
                    var progressLabel = new Label {
                        Left = 18, Top = 17, Width = 370, Height = 40,
                        Text = "Preparando descarga segura..."
                    };
                    var progressBar = new ProgressBar {
                        Left = 18, Top = 65, Width = 370, Height = 22,
                        Minimum = 0, Maximum = 100, Value = 0
                    };
                    progressWindow.Controls.Add(progressLabel);
                    progressWindow.Controls.Add(progressBar);
                    progressWindow.Show(owner);
                    string updateDir = Path.Combine(
                        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                        "TizenTube", "Updates", Guid.NewGuid().ToString("N"));
                    Directory.CreateDirectory(updateDir);
                    string archive = Path.Combine(updateDir, zipName);
                    string checksums = await client.GetStringAsync(checksumUrl);
                    var hashMatch = Regex.Match(checksums, @"(?im)^([0-9a-f]{64})\s+\*?" +
                        Regex.Escape(zipName) + @"\s*$");
                    if (!hashMatch.Success) throw new InvalidDataException(
                        "El archivo SHA256SUMS no contiene el paquete esperado. No se instalará.");
                    string sha = hashMatch.Groups[1].Value.ToLowerInvariant();
                    using (var response = await client.GetAsync(zipUrl, HttpCompletionOption.ResponseHeadersRead))
                    {
                        response.EnsureSuccessStatusCode();
                        if (response.Content.Headers.ContentLength > 250_000_000)
                            throw new InvalidDataException("El paquete supera el tamaño máximo autorizado.");
                        long total = response.Content.Headers.ContentLength ?? 0;
                        progressBar.Style = total > 0 ? ProgressBarStyle.Continuous : ProgressBarStyle.Marquee;
                        progressLabel.Text = "Descargando la nueva versión...";
                        using (var input = await response.Content.ReadAsStreamAsync())
                        using (var output = File.Create(archive))
                        {
                            byte[] buffer = new byte[65536];
                            long copied = 0;
                            int count;
                            while ((count = await input.ReadAsync(buffer, 0, buffer.Length)) > 0)
                            {
                                copied += count;
                                if (copied > 250_000_000)
                                    throw new InvalidDataException("La descarga supera el tamaño máximo.");
                                await output.WriteAsync(buffer, 0, count);
                                if (total > 0)
                                {
                                    int percent = (int)Math.Min(100, copied * 100 / total);
                                    progressBar.Value = percent;
                                    progressLabel.Text = $"Descargando... {percent}%";
                                }
                            }
                        }
                    }
                    progressBar.Style = ProgressBarStyle.Marquee;
                    progressLabel.Text = "Verificando integridad SHA-256...";
                    if (new FileInfo(archive).Length > 250_000_000 ||
                        FileSha256(archive) != sha)
                        throw new InvalidDataException("SHA-256 del paquete no coincide. Instalación cancelada.");

                    progressLabel.Text = "Preparando instalación y reinicio...";
                    // A detached copy must do the swap: Windows locks the
                    // original EXE while it is executing. No shell scripts or
                    // arbitrary network-supplied commands are ever executed.
                    // An apphost EXE alone is NOT a working .NET application.
                    // Copy its .NET runtime, DLLs and .runtimeconfig.json too,
                    // otherwise preview.15's detached updater fails to start.
                    string helperDirectory = Path.Combine(updateDir, "updater-host");
                    StageUpdaterHost(installed, helperDirectory);
                    string helper = Path.Combine(helperDirectory, "TizenTubeHost.exe");
                    var start = new ProcessStartInfo(helper) {
                        UseShellExecute = true, WorkingDirectory = helperDirectory
                    };
                    start.ArgumentList.Add("--apply-update");
                    start.ArgumentList.Add(installed);
                    start.ArgumentList.Add(archive);
                    start.ArgumentList.Add(sha);
                    start.ArgumentList.Add(Process.GetCurrentProcess().Id.ToString());
                    Process.Start(start);
                    owner.Close();
                    }
                }
            }
            catch (Exception ex)
            {
                if (!owner.IsDisposed)
                    MessageBox.Show(owner, "No se aplicó ninguna actualización:\n" + ex.Message,
                        "TizenTube", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
            finally { busy = false; }
        }

        private static string FileSha256(string path)
        {
            using (var sha = SHA256.Create())
            using (var file = File.OpenRead(path))
                return BitConverter.ToString(sha.ComputeHash(file)).Replace("-", "").ToLowerInvariant();
        }

        public static bool IsProtectedDirectory(string directory)
        {
            if (string.IsNullOrWhiteSpace(directory)) return true;
            try
            {
                string full = Path.GetFullPath(directory).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
                string desktop = Environment.GetFolderPath(Environment.SpecialFolder.Desktop).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
                string userProfile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
                string system = Environment.GetFolderPath(Environment.SpecialFolder.System).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
                string windows = Environment.GetFolderPath(Environment.SpecialFolder.Windows).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
                string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
                string appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
                string downloads = Path.Combine(userProfile, "Downloads");

                if (string.Equals(full, desktop, StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(full, userProfile, StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(full, system, StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(full, windows, StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(full, localAppData, StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(full, appData, StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(full, downloads, StringComparison.OrdinalIgnoreCase))
                    return true;

                if (Path.GetPathRoot(full)?.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar)
                    .Equals(full, StringComparison.OrdinalIgnoreCase) == true)
                    return true;
            }
            catch { return true; }
            return false;
        }

        private static bool IsPortableInstallation(string directory)
        {
            if (string.IsNullOrWhiteSpace(directory) || !Directory.Exists(directory))
                return false;
            if (IsProtectedDirectory(directory))
                return false;
            // Never treat a random folder as a safe replacement target.
            // The folder NAME, however, is a user choice and must not matter.
            return File.Exists(Path.Combine(directory, "TizenTubeHost.exe"));
        }

        private static void StageUpdaterHost(string install, string destination)
        {
            if (Directory.Exists(destination))
                throw new IOException("Update helper staging destination already exists");
            Directory.CreateDirectory(destination);
            foreach (var source in Directory.EnumerateFiles(install, "*", SearchOption.AllDirectories))
            {
                // Do not follow arbitrary junctions/symlinks that a user
                // might have placed in the portable application directory.
                if ((File.GetAttributes(source) & FileAttributes.ReparsePoint) != 0)
                    throw new InvalidDataException("Refusing updater host filesystem links");
                string relative = Path.GetRelativePath(install, source);
                string target = Path.Combine(destination, relative);
                Directory.CreateDirectory(Path.GetDirectoryName(target)!);
                RobustFileCopy(source, target, false);
            }
            if (!File.Exists(Path.Combine(destination, "TizenTubeHost.exe")))
                throw new InvalidDataException("Staged updater lacks native executable");
        }

        public static void CreateShortcut(string shortcutPath, string targetPath, string description = "TizenTube Windows")
        {
            try
            {
                Type shellType = Type.GetTypeFromProgID("WScript.Shell");
                if (shellType != null)
                {
                    object shell = Activator.CreateInstance(shellType);
                    object shortcut = shellType.InvokeMember("CreateShortcut",
                        BindingFlags.InvokeMethod, null, shell, new object[] { shortcutPath });
                    Type shortcutType = shortcut.GetType();
                    shortcutType.InvokeMember("TargetPath",
                        BindingFlags.SetProperty, null, shortcut, new object[] { targetPath });
                    shortcutType.InvokeMember("WorkingDirectory",
                        BindingFlags.SetProperty, null, shortcut, new object[] { Path.GetDirectoryName(targetPath) });
                    shortcutType.InvokeMember("Description",
                        BindingFlags.SetProperty, null, shortcut, new object[] { description });
                    shortcutType.InvokeMember("IconLocation",
                        BindingFlags.SetProperty, null, shortcut, new object[] { targetPath + ",0" });
                    shortcutType.InvokeMember("Save",
                        BindingFlags.InvokeMethod, null, shortcut, null);
                }
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"[WARN] Shortcut creation failed: {ex.Message}");
            }
        }

        public static string GetDefaultInstallDirectory()
        {
            return Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "Programs", "TizenTube");
        }

        public static bool InstallApplication(string sourceDir, out string installedExe, out string errorMessage)
        {
            installedExe = null;
            errorMessage = null;
            try
            {
                string targetDir = GetDefaultInstallDirectory();
                Directory.CreateDirectory(targetDir);

                if (Directory.Exists(sourceDir))
                {
                    foreach (var file in Directory.EnumerateFiles(sourceDir, "*", SearchOption.AllDirectories))
                    {
                        if ((File.GetAttributes(file) & FileAttributes.ReparsePoint) != 0) continue;
                        string rel = Path.GetRelativePath(sourceDir, file);
                        string dest = Path.Combine(targetDir, rel);
                        Directory.CreateDirectory(Path.GetDirectoryName(dest)!);
                        RobustFileCopy(file, dest, true);
                    }
                }
                else if (File.Exists(sourceDir))
                {
                    string dest = Path.Combine(targetDir, "TizenTubeHost.exe");
                    RobustFileCopy(sourceDir, dest, true);
                }

                installedExe = Path.Combine(targetDir, "TizenTubeHost.exe");
                if (!File.Exists(installedExe))
                {
                    errorMessage = "No se encontró TizenTubeHost.exe para instalar.";
                    return false;
                }

                // Desktop shortcut
                string desktop = Environment.GetFolderPath(Environment.SpecialFolder.Desktop);
                string desktopShortcut = Path.Combine(desktop, "TizenTube.lnk");
                CreateShortcut(desktopShortcut, installedExe);

                // Start Menu shortcut
                string startMenu = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.StartMenu),
                    "Programs", "TizenTube");
                Directory.CreateDirectory(startMenu);
                string startMenuShortcut = Path.Combine(startMenu, "TizenTube.lnk");
                CreateShortcut(startMenuShortcut, installedExe);

                // Register in Windows Add/Remove programs
                RegisterInWindowsUninstall(targetDir, installedExe);

                return true;
            }
            catch (Exception ex)
            {
                errorMessage = ex.Message;
                return false;
            }
        }

        private static void RegisterInWindowsUninstall(string installDir, string exePath)
        {
            try
            {
                using (var key = Registry.CurrentUser.CreateSubKey(
                    @"Software\Microsoft\Windows\CurrentVersion\Uninstall\TizenTube"))
                {
                    if (key != null)
                    {
                        key.SetValue("DisplayName", "TizenTube");
                        key.SetValue("DisplayVersion", "0.1.0-preview.32");
                        key.SetValue("Publisher", "TizenTube Windows Contributors");
                        // Shell icon caching is keyed by exe path; use the
                        // published sidecar ICO so upgrades refresh the logo.
                        string iconPath = Path.Combine(installDir, "TizenTube.ico");
                        key.SetValue("DisplayIcon", File.Exists(iconPath) ? iconPath : exePath);
                        key.SetValue("InstallLocation", installDir);
                        key.SetValue("UninstallString", $"\"{exePath}\" --uninstall");
                        key.SetValue("NoModify", 1);
                        key.SetValue("NoRepair", 1);
                    }
                }
            }
            catch { }
        }

        public static int UninstallApplication()
        {
            try
            {
                string desktop = Environment.GetFolderPath(Environment.SpecialFolder.Desktop);
                string desktopShortcut = Path.Combine(desktop, "TizenTube.lnk");
                if (File.Exists(desktopShortcut)) File.Delete(desktopShortcut);

                string startMenu = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.StartMenu),
                    "Programs", "TizenTube");
                if (Directory.Exists(startMenu)) Directory.Delete(startMenu, true);

                try
                {
                    Registry.CurrentUser.DeleteSubKeyTree(
                        @"Software\Microsoft\Windows\CurrentVersion\Uninstall\TizenTube", false);
                }
                catch { }

                MessageBox.Show("TizenTube se ha desinstalado de accesos directos y del registro.\n" +
                    "La carpeta de la aplicación puede eliminarse una vez cerrada la ventana.",
                    "Desinstalación de TizenTube", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return 0;
            }
            catch (Exception ex)
            {
                MessageBox.Show("Error durante la desinstalación: " + ex.Message,
                    "Desinstalación de TizenTube", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return 1;
            }
        }

        public static int VerifyDetachedUpdaterHost(string installed, string scratch)
        {
            try
            {
                string target = Path.Combine(scratch, "updater-host");
                StageUpdaterHost(installed, target);
                var start = new ProcessStartInfo(Path.Combine(target, "TizenTubeHost.exe")) {
                    UseShellExecute = false, WorkingDirectory = target
                };
                start.ArgumentList.Add("--help");
                using (var child = Process.Start(start))
                {
                    if (child == null || !child.WaitForExit(15000) || child.ExitCode != 0)
                        throw new InvalidOperationException("Detached updater host failed to boot");
                }
                return 0;
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine("UPDATER_DETACHED_HOST_FAILED: " + ex.Message);
                return 22;
            }
        }

        public static int ApplyVerifiedUpdate(string install, string archive, string sha, string parentId)
            => ApplyVerifiedUpdateCore(install, archive, sha, parentId, true);

        private static int ApplyVerifiedUpdateCore(string install, string archive,
            string sha, string parentId, bool relaunch)
        {
            string backup = null, stage = null;
            try
            {
                install = Path.GetFullPath(install);
                if (!IsPortableInstallation(install) ||
                    !Regex.IsMatch(sha, "^[0-9a-f]{64}$") ||
                    !int.TryParse(parentId, out int pid)) return 2;
                if (FileSha256(archive) != sha) return 3;
                try {
                    using (var original = Process.GetProcessById(pid))
                        if (!original.WaitForExit(60_000)) return 6;
                }
                catch (ArgumentException) { /* Already closed */ }

                TerminateWebView2Processes(pid, install);
                System.Threading.Thread.Sleep(300);

                string parent = Directory.GetParent(Path.GetFullPath(install)).FullName;
                string nonce = Guid.NewGuid().ToString("N");
                stage = Path.Combine(parent, ".tizentube-stage-" + nonce);
                backup = Path.Combine(parent, ".tizentube-backup-" + nonce);
                Directory.CreateDirectory(stage);
                ZipFile.ExtractToDirectory(archive, stage);
                string root = Path.Combine(stage, PortableFolder);
                if (!File.Exists(Path.Combine(root, "TizenTubeHost.exe")) ||
                    !File.Exists(Path.Combine(root, "LEEME_INSTALACION.md")))
                    return 4;
                RobustDirectoryMove(install, backup);
                try { RobustDirectoryMove(root, install); }
                catch
                {
                    try { RobustDirectoryMove(backup, install); } catch { }
                    throw;
                }
                try
                {
                    if (relaunch)
                        Process.Start(new ProcessStartInfo(Path.Combine(install, "TizenTubeHost.exe"))
                            { WorkingDirectory = install, UseShellExecute = true });
                }
                catch
                {
                    // Process launch can fail after a successful directory
                    // swap. Keep the previous installation usable.
                    string failed = Path.Combine(parent, ".tizentube-failed-" + nonce);
                    try { RobustDirectoryMove(install, failed); } catch { }
                    try { RobustDirectoryMove(backup, install); } catch { }
                    throw;
                }
                // Keep backup as a reversible rollback rather than silently
                // destroying user's prior installation.
                return 0;
            }
            catch (Exception ex)
            {
                if (relaunch)
                    MessageBox.Show("No fue posible reemplazar la aplicación:\n" + ex.Message +
                        "\nLa instalación anterior se conserva cuando es posible.",
                        "Actualización TizenTube", MessageBoxButtons.OK, MessageBoxIcon.Error);
                else
                    Console.Error.WriteLine("UPDATER_IN_PLACE_FAILED: " + ex);
                return 5;
            }
        }

        // Real Windows filesystem transaction probe, deliberately using a
        // *renamed* portable directory. Never touches a user's installation,
        // never opens YouTube and never launches the fake replacement EXE.
        public static int VerifyInPlaceUpdate()
        {
            string scratch = Path.Combine(Path.GetTempPath(),
                "tizentube-in-place-update-test-" + Guid.NewGuid().ToString("N"));
            try
            {
                string install = Path.Combine(scratch, "TizenTube personal (2)");
                string payload = Path.Combine(scratch, "payload", PortableFolder);
                Directory.CreateDirectory(install);
                Directory.CreateDirectory(payload);
                foreach (var directory in new[] { install, payload })
                {
                    File.WriteAllText(Path.Combine(directory, "LEEME_INSTALACION.md"), "portable");
                }
                File.WriteAllText(Path.Combine(install, "TizenTubeHost.exe"), "old-exe");
                File.WriteAllText(Path.Combine(payload, "TizenTubeHost.exe"), "new-exe");
                // A failed digest must leave the original folder untouched.
                string zip = Path.Combine(scratch, "release.zip");
                ZipFile.CreateFromDirectory(Path.Combine(scratch, "payload"), zip);
                if (ApplyVerifiedUpdateCore(install, zip, new string('0', 64), "2147483647", false) != 3 ||
                    File.ReadAllText(Path.Combine(install, "TizenTubeHost.exe")) != "old-exe")
                    return 41;
                int code = ApplyVerifiedUpdateCore(install, zip, FileSha256(zip), "2147483647", false);
                if (code != 0 ||
                    File.ReadAllText(Path.Combine(install, "TizenTubeHost.exe")) != "new-exe" ||
                    !Directory.GetDirectories(scratch, ".tizentube-backup-*", SearchOption.TopDirectoryOnly)
                        .Any(backup => File.ReadAllText(Path.Combine(backup, "TizenTubeHost.exe")) == "old-exe"))
                    return 42;
                return 0;
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine("UPDATER_IN_PLACE_TEST_FAILED: " + ex);
                return 43;
            }
            finally
            {
                try { Directory.Delete(scratch, recursive: true); } catch { }
            }
        }

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern IntPtr CreateToolhelp32Snapshot(uint dwFlags, uint th32ProcessID);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool Process32First(IntPtr hSnapshot, ref PROCESSENTRY32 lppe);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool Process32Next(IntPtr hSnapshot, ref PROCESSENTRY32 lppe);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool CloseHandle(IntPtr hObject);

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
        private struct PROCESSENTRY32
        {
            public uint dwSize;
            public uint cntUsage;
            public uint th32ProcessID;
            public IntPtr th32DefaultHeapID;
            public uint th32ModuleID;
            public uint cntThreads;
            public uint th32ParentProcessID;
            public int pcPriClassBase;
            public uint dwFlags;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)]
            public string szExeFile;
        }

        private const uint TH32CS_SNAPPROCESS = 0x00000002;

        private static void TerminateWebView2Processes(int parentPid, string installDir)
        {
            try
            {
                var targetPids = new System.Collections.Generic.HashSet<int>();
                if (parentPid > 0)
                {
                    try
                    {
                        IntPtr snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
                        if (snap != IntPtr.Zero && snap != (IntPtr)(-1))
                        {
                            try
                            {
                                var pe = new PROCESSENTRY32();
                                pe.dwSize = (uint)Marshal.SizeOf(typeof(PROCESSENTRY32));
                                if (Process32First(snap, ref pe))
                                {
                                    do
                                    {
                                        if (pe.th32ParentProcessID == (uint)parentPid)
                                        {
                                            targetPids.Add((int)pe.th32ProcessID);
                                        }
                                    } while (Process32Next(snap, ref pe));
                                }
                            }
                            finally
                            {
                                CloseHandle(snap);
                            }
                        }
                    }
                    catch { }
                }

                foreach (var proc in Process.GetProcessesByName("msedgewebview2"))
                {
                    try
                    {
                        bool shouldKill = targetPids.Contains(proc.Id);
                        if (!shouldKill)
                        {
                            try
                            {
                                string exePath = proc.MainModule?.FileName;
                                if (!string.IsNullOrEmpty(exePath) && exePath.StartsWith(installDir, StringComparison.OrdinalIgnoreCase))
                                    shouldKill = true;
                            }
                            catch { }
                        }

                        if (shouldKill)
                        {
                            proc.Kill();
                            proc.WaitForExit(2000);
                        }
                    }
                    catch { }
                    finally
                    {
                        proc.Dispose();
                    }
                }
            }
            catch { }
        }

        private static void RobustDirectoryMove(string source, string destination, int maxRetries = 5, int delayMs = 300)
        {
            for (int i = 0; i < maxRetries; i++)
            {
                try
                {
                    Directory.Move(source, destination);
                    return;
                }
                catch (Exception ex) when (ex is IOException || ex is UnauthorizedAccessException)
                {
                    if (i == maxRetries - 1) throw;
                    System.Threading.Thread.Sleep(delayMs);
                }
            }
            Directory.Move(source, destination);
        }

        private static void RobustFileCopy(string source, string destination, bool overwrite, int maxRetries = 5, int delayMs = 300)
        {
            for (int i = 0; i < maxRetries; i++)
            {
                try
                {
                    File.Copy(source, destination, overwrite);
                    return;
                }
                catch (Exception ex) when (ex is IOException || ex is UnauthorizedAccessException)
                {
                    if (i == maxRetries - 1) throw;
                    System.Threading.Thread.Sleep(delayMs);
                }
            }
            File.Copy(source, destination, overwrite);
        }
    }
}
