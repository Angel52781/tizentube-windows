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
        private const int CurrentPreview = 16;
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

                    string installed = Path.GetDirectoryName(Application.ExecutablePath);
                    bool portable = Path.GetFileName(installed).Equals(PortableFolder,
                        StringComparison.OrdinalIgnoreCase)
                        && File.Exists(Path.Combine(installed, "LEEME_INSTALACION.md"));
                    var decision = MessageBox.Show(owner,
                        $"Versión nueva disponible: preview.{newest}\n" +
                        $"Versión instalada: preview.{CurrentPreview}\n\n" +
                        (portable
                            ? "¿Descargar, verificar SHA-256 e instalar ahora? Se conservarán tu sesión y preferencias."
                            : "La aplicación no está en su carpeta portable original. ¿Abrir la descarga oficial para instalarla manualmente?"),
                        "Actualización disponible", MessageBoxButtons.YesNo, MessageBoxIcon.Question);
                    if (decision != DialogResult.Yes) return;
                    if (!portable)
                    {
                        Process.Start(new ProcessStartInfo(zipUrl) { UseShellExecute = true });
                        return;
                    }
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
                        using (var input = await response.Content.ReadAsStreamAsync())
                        using (var output = File.Create(archive))
                            await input.CopyToAsync(output);
                    }
                    if (new FileInfo(archive).Length > 250_000_000 ||
                        FileSha256(archive) != sha)
                        throw new InvalidDataException("SHA-256 del paquete no coincide. Instalación cancelada.");

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
        {
            string backup = null, stage = null;
            try
            {
                if (Path.GetFileName(Path.GetFullPath(install)) != PortableFolder ||
                    !File.Exists(Path.Combine(install, "LEEME_INSTALACION.md")) ||
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
                MessageBox.Show("No fue posible reemplazar la aplicación:\n" + ex.Message +
                    "\nLa instalación anterior se conserva cuando es posible.",
                    "Actualización TizenTube", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return 5;
            }
        }
    }
}
