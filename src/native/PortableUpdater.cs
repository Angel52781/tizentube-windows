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

namespace TizenTubeWindows
{
    internal static class PortableUpdater
    {
        private const int CurrentPreview = 20;
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
                        MessageBox.Show(owner, "La aplicación se está ejecutando fuera de una instalación portable completa." +
                            "\n\nNo se reemplazará ninguna carpeta ni se abrirá una descarga inesperada." +
                            "\nExtrae el paquete completo una vez y abre TizenTubeHost.exe desde esa carpeta.",
                            "Actualización no disponible en esta ubicación",
                            MessageBoxButtons.OK, MessageBoxIcon.Warning);
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

        private static bool IsPortableInstallation(string directory)
        {
            if (string.IsNullOrWhiteSpace(directory) || !Directory.Exists(directory))
                return false;
            // Never treat a random folder as a safe replacement target.
            // The folder NAME, however, is a user choice and must not matter.
            return File.Exists(Path.Combine(directory, "TizenTubeHost.exe"))
                && File.Exists(Path.Combine(directory, "TizenTubeHost.runtimeconfig.json"))
                && File.Exists(Path.Combine(directory, "LEEME_INSTALACION.md"));
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
                File.Copy(source, target, false);
            }
            if (!File.Exists(Path.Combine(destination, "TizenTubeHost.exe")) ||
                !File.Exists(Path.Combine(destination, "TizenTubeHost.runtimeconfig.json")))
                throw new InvalidDataException("Staged updater lacks native executable or runtime configuration");
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
                Directory.Move(install, backup);
                try { Directory.Move(root, install); }
                catch
                {
                    Directory.Move(backup, install);
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
                    Directory.Move(install, failed);
                    Directory.Move(backup, install);
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
                    File.WriteAllText(Path.Combine(directory, "TizenTubeHost.runtimeconfig.json"), "{}");
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
    }
}
