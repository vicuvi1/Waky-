using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

namespace WakyDesktop
{
    static class Program
    {
        private static string appDir = @"C:\Users\victo\.gemini\antigravity\scratch\WakyDesktop";
        private static string proofsDir;
        private static string recordsFile;
        private static string configFile;
        private static string tombstonesFile;
        private static string directivesFile;
        private static string backupsDir;
        private static HttpListener listener;
        private static int port = 48999;
        private static DateTime lastHeartbeat = DateTime.Now;
        private static DateTime lastSyncTime = DateTime.MinValue;

        private static string sshKeyPath;
        private static readonly string remoteHost = "ubuntu@92.5.93.119";
        private static readonly string remoteMemoryPath = "/opt/waky-bot/waky_memory.json";

        [System.Runtime.InteropServices.DllImport("user32.dll")]
        private static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
        private const byte VK_VOLUME_UP = 0xAF;
        private const uint KEYEVENTF_KEYUP = 0x0002;

        public static void UnmuteAndBoostVolume()
        {
            try
            {
                for (int i = 0; i < 25; i++)
                {
                    keybd_event(VK_VOLUME_UP, 0, 0, UIntPtr.Zero);
                    keybd_event(VK_VOLUME_UP, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
                    Thread.Sleep(5);
                }
                ThreadPool.QueueUserWorkItem(delegate(object o) {
                    try { System.Media.SystemSounds.Exclamation.Play(); } catch { }
                });
            }
            catch (Exception ex)
            {
                Log("Error in UnmuteAndBoostVolume: " + ex.Message);
            }
        }

        public static void EmergencyVolumeSpike()
        {
            try
            {
                // Force PC Master Volume from any level directly to 100%
                for (int i = 0; i < 50; i++)
                {
                    keybd_event(VK_VOLUME_UP, 0, 0, UIntPtr.Zero);
                    keybd_event(VK_VOLUME_UP, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
                    Thread.Sleep(3);
                }
                ThreadPool.QueueUserWorkItem(delegate(object o) {
                    try {
                        for (int b = 0; b < 3; b++)
                        {
                            System.Media.SystemSounds.Hand.Play();
                            Thread.Sleep(200);
                        }
                    } catch { }
                });
                Log("EMERGENCY VOLUME SPIKE ACTIVATED: Forced PC master audio to 100%");
            }
            catch (Exception ex)
            {
                Log("Error in EmergencyVolumeSpike: " + ex.Message);
            }
        }

        private static void Log(string msg)
        {
            try
            {
                string logFile = Path.Combine(appDir, "waky.log");
                File.AppendAllText(logFile, string.Format("[{0}] {1}\r\n", DateTime.Now, msg));
            }
            catch { }
        }

        [STAThread]
        static void Main()
        {
            AppDomain.CurrentDomain.UnhandledException += delegate(object s, UnhandledExceptionEventArgs e) {
                Log("CRITICAL UNHANDLED EXCEPTION: " + (e.ExceptionObject != null ? e.ExceptionObject.ToString() : "null"));
            };
            bool amIServer = false;
            try
            {
                if (!Directory.Exists(appDir))
                {
                    appDir = AppDomain.CurrentDomain.BaseDirectory;
                }
                Log("Starting WAKY Desktop app...");
                Log("CP1: Init paths");
                proofsDir = Path.Combine(appDir, "proofs");
                recordsFile = Path.Combine(appDir, "wake_records.json");
                configFile = Path.Combine(appDir, "waky_config.json");
                tombstonesFile = Path.Combine(appDir, "deleted_dates.json");
                directivesFile = Path.Combine(appDir, "directives.json");
                backupsDir = Path.Combine(appDir, "backups");

                string userProfile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
                sshKeyPath = Path.Combine(userProfile, ".ssh", "hermes-vm.key");

                Log("CP2: Checking dirs");
                if (!Directory.Exists(proofsDir)) Directory.CreateDirectory(proofsDir);
                if (!Directory.Exists(backupsDir)) Directory.CreateDirectory(backupsDir);
                if (!File.Exists(recordsFile)) SaveFileAtomic(recordsFile, "[]");
                if (!File.Exists(tombstonesFile)) SaveFileAtomic(tombstonesFile, "[]");
                // [Directives file removed]
                if (!File.Exists(configFile))
                {
                    string defConfig = "{\"targetTime\":\"07:00\",\"tgToken\":\"8814364854:AAE3HpffTsEX3x6xnl74Fx0Lff6OxOxeTeA\",\"tgChatId\":\"1900611848\",\"botUsername\":\"wakyyyy_bot\",\"paired\":true}";
                    SaveFileAtomic(configFile, defConfig);
                }

                Log("CP3: Ensure startup shortcut");
                EnsureStartupShortcut();
                Log("CP4: Rolling backup");
                PerformDailyRollingBackup();

                Log("CP5: Check port");
                bool isPortOpen = IsPortInUse(port);
                Log("Port " + port + " in use: " + isPortOpen);
                if (!isPortOpen)
                {
                    StartHttpServer();
                    amIServer = true;
                    Log("Started HTTP server on port " + port);

                    ThreadPool.QueueUserWorkItem(delegate(object o) {
                        PerformCloudSync();
                        PerformGoogleDriveSync();
                    });
                }
                else
                {
                    try
                    {
                        var req = (HttpWebRequest)WebRequest.Create("http://localhost:" + port + "/api/heartbeat");
                        req.Timeout = 1500;
                        using (var resp = req.GetResponse()) { }
                        Log("Existing WAKY server is healthy and responding.");
                    }
                    catch
                    {
                        Log("Port in use but unresponsive. Retrying takeover in 1s...");
                        Thread.Sleep(1000);
                        try
                        {
                            StartHttpServer();
                            amIServer = true;
                            Log("Successfully took over HTTP server on port " + port);
                        }
                        catch (Exception ex)
                        {
                            Log("Takeover attempt note: " + ex.Message);
                        }
                    }
                }

                // Launch Chrome or Edge in App Mode
                Log("Launching browser app...");
                LaunchBrowserApp();

                if (amIServer)
                {
                    Log("Entering server loop...");
                    lastHeartbeat = DateTime.Now;
                    while (true)
                    {
                        Thread.Sleep(3000);

                        // Continuous 60s background sync with Hermes VM & Google Drive
                        if ((DateTime.Now - lastSyncTime).TotalSeconds >= 60)
                        {
                            ThreadPool.QueueUserWorkItem(delegate(object o) {
                                PerformCloudSync();
                                PerformGoogleDriveSync();
                            });
                        }

                        // Stay active as long as app sends heartbeats within 30 minutes
                        if ((DateTime.Now - lastHeartbeat).TotalMinutes > 30)
                        {
                            Log("Server loop timeout (30m without heartbeat), exiting.");
                            break;
                        }
                    }
                }
                else
                {
                    Log("Already running in another instance, client exited.");
                }
            }
            catch (Exception ex)
            {
                Log("FATAL ERROR: " + ex.ToString());
            }
            finally
            {
                if (amIServer && listener != null && listener.IsListening)
                {
                    try { listener.Stop(); } catch { }
                }
                Log("WAKY session finished.");
            }
        }

        private static bool IsPortInUse(int p)
        {
            try
            {
                var ipGlobal = System.Net.NetworkInformation.IPGlobalProperties.GetIPGlobalProperties();
                var listeners = ipGlobal.GetActiveTcpListeners();
                foreach (var ep in listeners)
                {
                    if (ep.Port == p) return true;
                }
                return false;
            }
            catch
            {
                return false;
            }
        }

        private static void LaunchBrowserApp()
        {
            try
            {
                string chromePath = @"C:\Program Files\Google\Chrome\Application\chrome.exe";
                string chromePathX86 = @"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe";
                string edgePath64 = @"C:\Program Files\Microsoft\Edge\Application\msedge.exe";
                string edgePath = @"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe";

                string browserExe = null;
                if (File.Exists(chromePath)) browserExe = chromePath;
                else if (File.Exists(chromePathX86)) browserExe = chromePathX86;
                else if (File.Exists(edgePath64)) browserExe = edgePath64;
                else if (File.Exists(edgePath)) browserExe = edgePath;

                string profileDir = Path.Combine(appDir, "profile");
                string appUrl = string.Format("http://localhost:{0}/", port);

                if (browserExe != null)
                {
                    string args = string.Format("--app=\"{0}\" --user-data-dir=\"{1}\" --window-size=1440,920 --start-maximized --no-first-run --no-default-browser-check", appUrl, profileDir);
                    ProcessStartInfo psi = new ProcessStartInfo(browserExe, args);
                    psi.UseShellExecute = true;
                    Process.Start(psi);
                    Log("Launched browser via: " + browserExe);
                }
                else
                {
                    Process.Start(appUrl);
                    Log("Launched default browser for: " + appUrl);
                }
            }
            catch (Exception ex)
            {
                Log("Browser launch notice: " + ex.Message);
                try { Process.Start(string.Format("http://localhost:{0}/", port)); } catch { }
            }
        }

        private static void StartHttpServer()
        {
            listener = new HttpListener();
            listener.Prefixes.Add(string.Format("http://localhost:{0}/", port));
            listener.Prefixes.Add(string.Format("http://127.0.0.1:{0}/", port));
            listener.Start();

            ThreadPool.QueueUserWorkItem(delegate(object o)
            {
                while (listener != null && listener.IsListening)
                {
                    try
                    {
                        var context = listener.GetContext();
                        ThreadPool.QueueUserWorkItem(delegate(object c) {
                            HandleRequest((HttpListenerContext)c);
                        }, context);
                    }
                    catch
                    {
                        if (listener == null || !listener.IsListening) break;
                    }
                }
            });
        }

        private static void HandleRequest(HttpListenerContext ctx)
        {
            try
            {
                string rawUrl = ctx.Request.RawUrl;
                string path = rawUrl.Split('?')[0];

                lastHeartbeat = DateTime.Now;

                // CORS headers
                ctx.Response.Headers.Add("Access-Control-Allow-Origin", "*");
                ctx.Response.Headers.Add("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
                ctx.Response.Headers.Add("Access-Control-Allow-Headers", "Content-Type");

                if (ctx.Request.HttpMethod == "OPTIONS")
                {
                    SendBytes(ctx, new byte[0], "text/plain", 200);
                    return;
                }

                if (path == "/" || path == "/index.html")
                {
                    string htmlPath = Path.Combine(appDir, "index.html");
                    if (File.Exists(htmlPath))
                    {
                        byte[] bytes = File.ReadAllBytes(htmlPath);
                        SendBytes(ctx, bytes, "text/html; charset=utf-8", 200);
                    }
                    else
                    {
                        SendBytes(ctx, Encoding.UTF8.GetBytes("Not Found"), "text/plain", 404);
                    }
                }
                else if (path == "/waky.ico")
                {
                    string iconPath = Path.Combine(appDir, "waky.ico");
                    if (File.Exists(iconPath))
                    {
                        byte[] bytes = File.ReadAllBytes(iconPath);
                        SendBytes(ctx, bytes, "image/x-icon", 200);
                    }
                    else
                    {
                        SendBytes(ctx, new byte[0], "image/x-icon", 404);
                    }
                }
                else if (path.EndsWith(".png") || path.EndsWith(".jpg") || path.EndsWith(".jpeg") || path.EndsWith(".svg") || path.EndsWith(".webp"))
                {
                    string fileName = Path.GetFileName(path);
                    string filePath = Path.Combine(appDir, fileName);
                    if (File.Exists(filePath))
                    {
                        byte[] bytes = File.ReadAllBytes(filePath);
                        string mime = "image/png";
                        if (path.EndsWith(".jpg") || path.EndsWith(".jpeg")) mime = "image/jpeg";
                        else if (path.EndsWith(".svg")) mime = "image/svg+xml";
                        else if (path.EndsWith(".webp")) mime = "image/webp";
                        SendBytes(ctx, bytes, mime, 200);
                    }
                    else
                    {
                        SendBytes(ctx, new byte[0], "text/plain", 404);
                    }
                }
                else if (path == "/api/heartbeat")
                {
                    byte[] bytes = Encoding.UTF8.GetBytes("{\"ok\":true}");
                    SendBytes(ctx, bytes, "application/json", 200);
                }
                else if (path == "/api/sync")
                {
                    ThreadPool.QueueUserWorkItem(delegate(object o) {
                        PerformCloudSync();
                        PerformGoogleDriveSync();
                    });
                    string syncStr = (lastSyncTime == DateTime.MinValue) ? "Just now" : lastSyncTime.ToString("yyyy-MM-dd HH:mm:ss");
                    byte[] bytes = Encoding.UTF8.GetBytes(string.Format("{{\"ok\":true,\"last_sync\":\"{0}\"}}", syncStr));
                    SendBytes(ctx, bytes, "application/json", 200);
                }
                else if (path == "/api/config" && ctx.Request.HttpMethod == "GET")
                {
                    string json = File.Exists(configFile) ? File.ReadAllText(configFile, Encoding.UTF8) : "{}";
                    byte[] bytes = Encoding.UTF8.GetBytes(json);
                    SendBytes(ctx, bytes, "application/json; charset=utf-8", 200);
                }
                else if (path == "/api/config" && ctx.Request.HttpMethod == "POST")
                {
                    using (var reader = new StreamReader(ctx.Request.InputStream, Encoding.UTF8))
                    {
                        string body = reader.ReadToEnd();
                        File.WriteAllText(configFile, body, Encoding.UTF8);
                    }
                    ThreadPool.QueueUserWorkItem(delegate(object o) {
                        PerformCloudSync();
                        PerformGoogleDriveSync();
                    });
                    byte[] bytes = Encoding.UTF8.GetBytes("{\"ok\":true}");
                    SendBytes(ctx, bytes, "application/json", 200);
                }
                else if (path == "/api/records" && ctx.Request.HttpMethod == "GET")
                {
                    string json = File.Exists(recordsFile) ? File.ReadAllText(recordsFile, Encoding.UTF8) : "[]";
                    byte[] bytes = Encoding.UTF8.GetBytes(json);
                    SendBytes(ctx, bytes, "application/json; charset=utf-8", 200);
                }
                else if (path == "/api/records" && ctx.Request.HttpMethod == "POST")
                {
                    using (var reader = new StreamReader(ctx.Request.InputStream, Encoding.UTF8))
                    {
                        string body = reader.ReadToEnd();
                        SaveRecordsAuthoritative(body);
                    }
                    byte[] bytes = Encoding.UTF8.GetBytes("{\"ok\":true}");
                    SendBytes(ctx, bytes, "application/json", 200);
                }
                else if (path == "/api/records/delete" && ctx.Request.HttpMethod == "POST")
                {
                    using (var reader = new StreamReader(ctx.Request.InputStream, Encoding.UTF8))
                    {
                        string body = reader.ReadToEnd();
                        try
                        {
                            var serializer = new JavaScriptSerializer();
                            var dict = serializer.Deserialize<Dictionary<string, object>>(body);
                            if (dict != null && dict.ContainsKey("date") && dict["date"] != null)
                            {
                                string delDate = dict["date"].ToString();
                                var tombstones = LoadTombstones();
                                tombstones.Add(delDate);
                                SaveTombstones(tombstones);

                                string oldJson = File.Exists(recordsFile) ? File.ReadAllText(recordsFile, Encoding.UTF8) : "[]";
                                var localList = serializer.Deserialize<List<Dictionary<string, object>>>(oldJson) ?? new List<Dictionary<string, object>>();
                                localList.RemoveAll(delegate(Dictionary<string, object> item) {
                                    return item.ContainsKey("date") && item["date"] != null && item["date"].ToString() == delDate;
                                });
                                File.WriteAllText(recordsFile, serializer.Serialize(localList), Encoding.UTF8);

                                ThreadPool.QueueUserWorkItem(delegate(object o) {
                                    PerformCloudSync();
                                });
                            }
                        }
                        catch { }
                    }
                    byte[] bytes = Encoding.UTF8.GetBytes("{\"ok\":true}");
                    SendBytes(ctx, bytes, "application/json", 200);
                }
                else if (path == "/api/records/clear_all" && ctx.Request.HttpMethod == "POST")
                {
                    try
                    {
                        var serializer = new JavaScriptSerializer();
                        string oldJson = File.Exists(recordsFile) ? File.ReadAllText(recordsFile, Encoding.UTF8) : "[]";
                        var localList = serializer.Deserialize<List<Dictionary<string, object>>>(oldJson) ?? new List<Dictionary<string, object>>();
                        var tombstones = LoadTombstones();
                        foreach (var item in localList)
                        {
                            if (item.ContainsKey("date") && item["date"] != null)
                                tombstones.Add(item["date"].ToString());
                        }
                        SaveTombstones(tombstones);
                        File.WriteAllText(recordsFile, "[]", Encoding.UTF8);

                        ThreadPool.QueueUserWorkItem(delegate(object o) {
                            PerformCloudSync();
                        });
                    }
                    catch { }
                    byte[] bytes = Encoding.UTF8.GetBytes("{\"ok\":true}");
                    SendBytes(ctx, bytes, "application/json", 200);
                }
                else if (path == "/api/save_proof" && ctx.Request.HttpMethod == "POST")
                {
                    string queryName = ctx.Request.QueryString["name"];
                    if (string.IsNullOrEmpty(queryName))
                    {
                        queryName = string.Format("proof_{0:yyyy-MM-dd_HH-mm-ss}.webm", DateTime.Now);
                    }
                    string savePath = Path.Combine(proofsDir, queryName);

                    using (var fs = new FileStream(savePath, FileMode.Create, FileAccess.Write))
                    {
                        ctx.Request.InputStream.CopyTo(fs);
                    }

                    string resJson = string.Format("{{\"ok\":true,\"fileName\":\"{0}\"}}", queryName);
                    byte[] bytes = Encoding.UTF8.GetBytes(resJson);
                    SendBytes(ctx, bytes, "application/json", 200);
                }
                else if (path == "/api/cloud_sync")
                {
                    bool success = PerformCloudSync();
                    ThreadPool.QueueUserWorkItem(delegate(object o) {
                        PerformGoogleDriveSync();
                    });
                    string updatedJson = File.Exists(recordsFile) ? File.ReadAllText(recordsFile, Encoding.UTF8) : "[]";
                    string responseJson = string.Format("{{\"ok\":true,\"cloudSynced\":{0},\"records\":{1}}}", success ? "true" : "false", updatedJson);
                    byte[] bytes = Encoding.UTF8.GetBytes(responseJson);
                    SendBytes(ctx, bytes, "application/json; charset=utf-8", 200);
                }
                else if (path == "/api/gdrive_sync")
                {
                    bool ok = PerformGoogleDriveSync();
                    string gdir = GetGoogleDriveBackupDir() ?? "";
                    string responseJson = string.Format("{{\"ok\":true,\"synced\":{0},\"path\":\"{1}\"}}", ok ? "true" : "false", gdir.Replace("\\", "\\\\"));
                    byte[] bytes = Encoding.UTF8.GetBytes(responseJson);
                    SendBytes(ctx, bytes, "application/json; charset=utf-8", 200);
                }
                else if (path == "/api/gdrive_status")
                {
                    string gdir = GetGoogleDriveBackupDir();
                    bool exists = !string.IsNullOrEmpty(gdir) && Directory.Exists(gdir);
                    string responseJson = string.Format("{{\"available\":{0},\"path\":\"{1}\"}}", exists ? "true" : "false", exists ? gdir.Replace("\\", "\\\\") : "");
                    byte[] bytes = Encoding.UTF8.GetBytes(responseJson);
                    SendBytes(ctx, bytes, "application/json; charset=utf-8", 200);
                }
                else if (path == "/api/unmute_and_alarm" && ctx.Request.HttpMethod == "POST")
                {
                    UnmuteAndBoostVolume();
                    byte[] bytes = Encoding.UTF8.GetBytes("{\"ok\":true,\"volume\":\"boosted\"}");
                    SendBytes(ctx, bytes, "application/json", 200);
                }
                else if (path == "/api/emergency_horn" && ctx.Request.HttpMethod == "POST")
                {
                    EmergencyVolumeSpike();
                    byte[] bytes = Encoding.UTF8.GetBytes("{\"ok\":true,\"volume\":\"emergency_100\"}");
                    SendBytes(ctx, bytes, "application/json", 200);
                }
                else if (path == "/api/directives" && ctx.Request.HttpMethod == "GET")
                {
                    string json = File.Exists(directivesFile) ? File.ReadAllText(directivesFile, Encoding.UTF8) : "{}";
                    byte[] bytes = Encoding.UTF8.GetBytes(json);
                    SendBytes(ctx, bytes, "application/json; charset=utf-8", 200);
                }
                else if (path == "/api/directives" && ctx.Request.HttpMethod == "POST")
                {
                    using (var reader = new StreamReader(ctx.Request.InputStream, Encoding.UTF8))
                    {
                        string body = reader.ReadToEnd();
                        SaveFileAtomic(directivesFile, body);
                        ThreadPool.QueueUserWorkItem(delegate(object o) {
                            PerformCloudSync();
                        });
                    }
                    byte[] bytes = Encoding.UTF8.GetBytes("{\"ok\":true}");
                    SendBytes(ctx, bytes, "application/json", 200);
                }
                else
                {
                    SendBytes(ctx, Encoding.UTF8.GetBytes("Not Found"), "text/plain", 404);
                }
            }
            catch (Exception ex)
            {
                try
                {
                    byte[] err = Encoding.UTF8.GetBytes(ex.Message);
                    SendBytes(ctx, err, "text/plain", 500);
                }
                catch { }
            }
        }

        public static bool PerformCloudSync()
        {
            try
            {
                if (!File.Exists(sshKeyPath)) return false;

                string tempCloudFile = Path.Combine(appDir, "cloud_temp.json");

                // 1. Pull waky_memory.json from hermes-vm
                ProcessStartInfo psiPull = new ProcessStartInfo();
                psiPull.FileName = "scp";
                psiPull.Arguments = string.Format("-i \"{0}\" -o StrictHostKeyChecking=no -o ConnectTimeout=5 {1}:{2} \"{3}\"",
                    sshKeyPath, remoteHost, remoteMemoryPath, tempCloudFile);
                psiPull.CreateNoWindow = true;
                psiPull.UseShellExecute = false;

                using (var p = Process.Start(psiPull))
                {
                    if (p.WaitForExit(10000) && p.ExitCode == 0 && File.Exists(tempCloudFile))
                    {
                        // 2. Perform JSON Merge
                        MergeCloudAndLocal(recordsFile, tempCloudFile);

                        // 3. Push merged file back to hermes-vm
                        ProcessStartInfo psiPush = new ProcessStartInfo();
                        psiPush.FileName = "scp";
                        psiPush.Arguments = string.Format("-i \"{0}\" -o StrictHostKeyChecking=no -o ConnectTimeout=5 \"{1}\" {2}:{3}",
                            sshKeyPath, tempCloudFile, remoteHost, remoteMemoryPath);
                        psiPush.CreateNoWindow = true;
                        psiPush.UseShellExecute = false;
                        using (var p2 = Process.Start(psiPush))
                        {
                            p2.WaitForExit(10000);
                        }

                        try { File.Delete(tempCloudFile); } catch { }
                        lastSyncTime = DateTime.Now;
                        Log("Cloud and bot synchronization completed successfully.");
                        return true;
                    }
                }
            }
            catch (Exception ex)
            {
                Log("Cloud sync notice: " + ex.Message);
            }
            return false;
        }

        private static void SaveFileAtomic(string filePath, string content)
        {
            try
            {
                string tmpPath = filePath + ".tmp";
                File.WriteAllText(tmpPath, content, Encoding.UTF8);
                if (File.Exists(filePath))
                {
                    File.Delete(filePath);
                }
                File.Move(tmpPath, filePath);
            }
            catch
            {
                try { File.WriteAllText(filePath, content, Encoding.UTF8); } catch { }
            }
        }

        private static void PerformDailyRollingBackup()
        {
            try
            {
                if (!Directory.Exists(backupsDir)) Directory.CreateDirectory(backupsDir);
                if (File.Exists(recordsFile))
                {
                    string dateStr = DateTime.Now.ToString("yyyy-MM-dd");
                    string backupFile = Path.Combine(backupsDir, string.Format("wake_records_backup_{0}.json", dateStr));
                    if (!File.Exists(backupFile))
                    {
                        File.Copy(recordsFile, backupFile, true);
                        Log("Created daily rolling backup: " + backupFile);
                    }
                }

                // Clean up backups older than 14 days
                var dirInfo = new DirectoryInfo(backupsDir);
                foreach (var file in dirInfo.GetFiles("wake_records_backup_*.json"))
                {
                    if ((DateTime.Now - file.CreationTime).TotalDays > 14)
                    {
                        try { file.Delete(); } catch { }
                    }
                }

                // Automatic sync to Google Drive
                ThreadPool.QueueUserWorkItem(delegate(object o) {
                    PerformGoogleDriveSync();
                });
            }
            catch (Exception ex)
            {
                Log("Notice on daily backup: " + ex.Message);
            }
        }

        private static void EnsureStartupShortcut()
        {
            try
            {
                string startupFolder = Environment.GetFolderPath(Environment.SpecialFolder.Startup);
                if (Directory.Exists(startupFolder))
                {
                    string lnkPath = Path.Combine(startupFolder, "WAKY.lnk");
                    if (File.Exists(lnkPath))
                    {
                        Log("Windows startup shortcut verified at: " + lnkPath);
                        return;
                    }

                    string exePath = Path.Combine(appDir, "WAKY.exe");
                    string icoPath = Path.Combine(appDir, "waky.ico");

                    Type shellType = Type.GetTypeFromProgID("WScript.Shell");
                    if (shellType != null)
                    {
                        dynamic shell = Activator.CreateInstance(shellType);
                        dynamic shortcut = shell.CreateShortcut(lnkPath);
                        shortcut.TargetPath = exePath;
                        shortcut.WorkingDirectory = appDir;
                        shortcut.IconLocation = icoPath + ",0";
                        shortcut.Description = "WAKY - Spartan Dawn Wake-Up Protocol";
                        shortcut.Save();
                        Log("Windows startup shortcut created at: " + lnkPath);
                    }
                }
            }
            catch (Exception ex)
            {
                Log("Notice on startup shortcut verification: " + ex.Message);
            }
        }

        private static string GetGoogleDriveBackupDir()
        {
            try
            {
                string[] candidateRoots = new string[] {
                    @"G:\My Drive",
                    @"H:\My Drive",
                    Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Google Drive"),
                    Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "GoogleDrive")
                };

                foreach (var root in candidateRoots)
                {
                    if (Directory.Exists(root))
                    {
                        string targetDir = Path.Combine(root, "Apps", "WAKY", "backup");
                        if (!Directory.Exists(targetDir))
                        {
                            Directory.CreateDirectory(targetDir);
                        }
                        return targetDir;
                    }
                }
            }
            catch { }
            return null;
        }

        public static bool PerformGoogleDriveSync()
        {
            try
            {
                string gdriveBackup = GetGoogleDriveBackupDir();
                if (string.IsNullOrEmpty(gdriveBackup) || !Directory.Exists(gdriveBackup))
                    return false;

                // Sync main database & config files
                if (File.Exists(recordsFile))
                    File.Copy(recordsFile, Path.Combine(gdriveBackup, "wake_records.json"), true);
                if (File.Exists(configFile))
                    File.Copy(configFile, Path.Combine(gdriveBackup, "waky_config.json"), true);
                if (File.Exists(tombstonesFile))
                    File.Copy(tombstonesFile, Path.Combine(gdriveBackup, "deleted_dates.json"), true);
                if (File.Exists(directivesFile))
                    File.Copy(directivesFile, Path.Combine(gdriveBackup, "directives.json"), true);

                // Sync rolling backups history
                if (Directory.Exists(backupsDir))
                {
                    string gdriveRolling = Path.Combine(gdriveBackup, "rolling_backups");
                    if (!Directory.Exists(gdriveRolling)) Directory.CreateDirectory(gdriveRolling);

                    foreach (var file in Directory.GetFiles(backupsDir, "*.json"))
                    {
                        string destFile = Path.Combine(gdriveRolling, Path.GetFileName(file));
                        File.Copy(file, destFile, true);
                    }
                }

                // Also ensure core executable is mirrored in Apps\WAKY
                string wakyParent = Path.GetDirectoryName(gdriveBackup);
                if (Directory.Exists(wakyParent))
                {
                    string exeSource = Path.Combine(appDir, "WAKY.exe");
                    if (File.Exists(exeSource))
                    {
                        File.Copy(exeSource, Path.Combine(wakyParent, "WAKY.exe"), true);
                    }
                    string icoSource = Path.Combine(appDir, "waky.ico");
                    if (File.Exists(icoSource))
                    {
                        File.Copy(icoSource, Path.Combine(wakyParent, "waky.ico"), true);
                    }
                }

                Log("Google Drive backup synchronized to: " + gdriveBackup);
                return true;
            }
            catch (Exception ex)
            {
                Log("Notice on Google Drive sync: " + ex.Message);
                return false;
            }
        }

        private static HashSet<string> LoadTombstones()
        {
            var set = new HashSet<string>();
            try
            {
                if (File.Exists(tombstonesFile))
                {
                    var serializer = new JavaScriptSerializer();
                    var list = serializer.Deserialize<List<string>>(File.ReadAllText(tombstonesFile, Encoding.UTF8));
                    if (list != null)
                    {
                        foreach (var s in list)
                        {
                            if (!string.IsNullOrEmpty(s)) set.Add(s);
                        }
                    }
                }
            }
            catch { }
            return set;
        }

        private static void SaveTombstones(HashSet<string> set)
        {
            try
            {
                var serializer = new JavaScriptSerializer();
                var list = new List<string>(set);
                SaveFileAtomic(tombstonesFile, serializer.Serialize(list));
            }
            catch { }
        }

        private static void SaveRecordsAuthoritative(string body)
        {
            try
            {
                var serializer = new JavaScriptSerializer();
                var newLocalList = serializer.Deserialize<List<Dictionary<string, object>>>(body);
                if (newLocalList == null) newLocalList = new List<Dictionary<string, object>>();

                string oldJson = File.Exists(recordsFile) ? File.ReadAllText(recordsFile, Encoding.UTF8) : "[]";
                var oldLocalList = serializer.Deserialize<List<Dictionary<string, object>>>(oldJson);
                if (oldLocalList == null) oldLocalList = new List<Dictionary<string, object>>();

                var newDates = new HashSet<string>();
                foreach (var item in newLocalList)
                {
                    if (item.ContainsKey("date") && item["date"] != null)
                        newDates.Add(item["date"].ToString());
                }

                var tombstones = LoadTombstones();
                // Dates that existed in old list but not in new list are considered deleted
                foreach (var item in oldLocalList)
                {
                    if (item.ContainsKey("date") && item["date"] != null)
                    {
                        string d = item["date"].ToString();
                        if (!newDates.Contains(d))
                        {
                            tombstones.Add(d);
                        }
                    }
                }

                // If user added or restored a date, remove from tombstones
                foreach (var d in newDates)
                {
                    if (tombstones.Contains(d)) tombstones.Remove(d);
                }
                SaveTombstones(tombstones);

                SaveFileAtomic(recordsFile, body);
                PerformDailyRollingBackup();

                ThreadPool.QueueUserWorkItem(delegate(object o) {
                    PerformCloudSync();
                });
            }
            catch (Exception ex)
            {
                Log("Error in SaveRecordsAuthoritative: " + ex.Message);
                SaveFileAtomic(recordsFile, body);
            }
        }

        private static int CalculateStreakFromLogs(List<object> logs)
        {
            if (logs == null || logs.Count == 0) return 0;
            var dates = new List<string>();
            foreach (var o in logs)
            {
                var dict = o as Dictionary<string, object>;
                if (dict != null && dict.ContainsKey("date") && dict["date"] != null)
                {
                    string d = dict["date"].ToString();
                    if (!dates.Contains(d)) dates.Add(d);
                }
            }
            if (dates.Count == 0) return 0;
            dates.Sort();
            dates.Reverse();

            DateTime nowLocal = DateTime.UtcNow.AddHours(3);
            string todayStr = nowLocal.ToString("yyyy-MM-dd");
            string yesterdayStr = nowLocal.AddDays(-1).ToString("yyyy-MM-dd");

            if (dates[0] != todayStr && dates[0] != yesterdayStr) return 0;

            int streak = 1;
            for (int i = 0; i < dates.Count - 1; i++)
            {
                DateTime d1, d2;
                if (DateTime.TryParse(dates[i], out d1) && DateTime.TryParse(dates[i + 1], out d2))
                {
                    if ((d1.Date - d2.Date).TotalDays == 1) streak++;
                    else break;
                }
            }
            return streak;
        }

        private static void MergeCloudAndLocal(string localRecPath, string cloudMemPath)
        {
            try
            {
                var serializer = new JavaScriptSerializer();
                string localJson = File.Exists(localRecPath) ? File.ReadAllText(localRecPath, Encoding.UTF8) : "[]";
                string cloudJson = File.Exists(cloudMemPath) ? File.ReadAllText(cloudMemPath, Encoding.UTF8) : "{}";

                var localList = serializer.Deserialize<List<Dictionary<string, object>>>(localJson);
                if (localList == null) localList = new List<Dictionary<string, object>>();

                var cloudObj = serializer.Deserialize<Dictionary<string, object>>(cloudJson);
                if (cloudObj == null) cloudObj = new Dictionary<string, object>();

                object logsObj;
                List<object> rawCloudLogs = new List<object>();
                if (cloudObj.TryGetValue("logs", out logsObj) && logsObj is System.Collections.IEnumerable)
                {
                    foreach (var o in (System.Collections.IEnumerable)logsObj)
                    {
                        rawCloudLogs.Add(o);
                    }
                }

                var tombstones = LoadTombstones();

                // Filter out any tombstoned dates from cloud logs and localList
                var cloudLogsList = new List<object>();
                foreach (var o in rawCloudLogs)
                {
                    var item = o as Dictionary<string, object>;
                    if (item != null && item.ContainsKey("date") && item["date"] != null)
                    {
                        string d = item["date"].ToString();
                        if (tombstones.Contains(d)) continue;
                        cloudLogsList.Add(o);
                    }
                }

                localList.RemoveAll(delegate(Dictionary<string, object> item) {
                    if (item.ContainsKey("date") && item["date"] != null)
                    {
                        return tombstones.Contains(item["date"].ToString());
                    }
                    return false;
                });

                // Index local dates
                var localDates = new Dictionary<string, Dictionary<string, object>>();
                foreach (var item in localList)
                {
                    if (item.ContainsKey("date") && item["date"] != null)
                    {
                        localDates[item["date"].ToString()] = item;
                    }
                }

                // Index cloud dates
                var cloudDates = new Dictionary<string, Dictionary<string, object>>();
                foreach (var obj in cloudLogsList)
                {
                    var item = obj as Dictionary<string, object>;
                    if (item != null && item.ContainsKey("date") && item["date"] != null)
                    {
                        cloudDates[item["date"].ToString()] = item;
                    }
                }

                // 1. Add any missing cloud items to local (if NOT in tombstones)
                foreach (var kvp in cloudDates)
                {
                    if (!tombstones.Contains(kvp.Key) && !localDates.ContainsKey(kvp.Key))
                    {
                        var cItem = kvp.Value;
                        var newLocal = new Dictionary<string, object>();
                        newLocal["date"] = kvp.Key;
                        string tVal = cItem.ContainsKey("time") && cItem["time"] != null ? cItem["time"].ToString() : "07:00";
                        newLocal["time"] = tVal;
                        newLocal["timeStr"] = tVal.Contains("AM") || tVal.Contains("PM") ? tVal : tVal + " AM";
                        
                        long unixMs = (long)(DateTime.UtcNow.Subtract(new DateTime(1970, 1, 1))).TotalMilliseconds;
                        if (cItem.ContainsKey("timestamp") && cItem["timestamp"] != null)
                        {
                            try {
                                long rawTs = Convert.ToInt64(cItem["timestamp"]);
                                unixMs = rawTs < 10000000000L ? rawTs * 1000 : rawTs;
                            } catch { }
                        }
                        newLocal["timestamp"] = unixMs;

                        object onTimeVal = cItem.ContainsKey("on_time") ? cItem["on_time"] : (cItem.ContainsKey("status") ? cItem["status"] : null);
                        bool onTime = SafeToBool(onTimeVal, true);
                        newLocal["status"] = onTime ? "on-time" : "late";
                        newLocal["statusLabel"] = onTime ? "ON-TIME ⚔️" : "LATE RISE ⚠️";
                        newLocal["xpEarned"] = onTime ? 100 : 50;
                        newLocal["streak"] = 1;
                        newLocal["rank"] = "Agoge Recruit";
                        newLocal["proofFileName"] = "";
                        newLocal["verified"] = true;
                        newLocal["method"] = cItem.ContainsKey("method") && cItem["method"] != null ? cItem["method"].ToString() : "Cloud";
                        localList.Add(newLocal);
                    }
                }

                // 2. Add or update local items to cloud
                foreach (var kvp in localDates)
                {
                    if (tombstones.Contains(kvp.Key)) continue;

                    var lItem = kvp.Value;
                    string ltVal = lItem.ContainsKey("time") && lItem["time"] != null ? lItem["time"].ToString().Replace(" AM", "").Replace(" PM", "").Trim() : "07:00";
                    object otVal = lItem.ContainsKey("on_time") ? lItem["on_time"] : (lItem.ContainsKey("status") ? lItem["status"] : null);
                    bool isOt = SafeToBool(otVal, true);

                    long unixSec = (long)(DateTime.UtcNow.Subtract(new DateTime(1970, 1, 1))).TotalSeconds;
                    if (lItem.ContainsKey("timestamp") && lItem["timestamp"] != null)
                    {
                        try {
                            long rawTs = Convert.ToInt64(lItem["timestamp"]);
                            unixSec = rawTs > 10000000000L ? rawTs / 1000 : rawTs;
                        } catch { }
                    }

                    if (cloudDates.ContainsKey(kvp.Key))
                    {
                        // Update existing cloud entry
                        var existingCloud = cloudDates[kvp.Key];
                        existingCloud["time"] = ltVal;
                        existingCloud["timestamp"] = unixSec;
                        existingCloud["on_time"] = isOt;
                        existingCloud["status"] = isOt ? "ON TIME ⚔️" : "LATE RISE ⚠️";
                    }
                    else
                    {
                        // Insert new cloud entry
                        var newCloud = new Dictionary<string, object>();
                        newCloud["date"] = kvp.Key;
                        newCloud["time"] = ltVal;
                        newCloud["timestamp"] = unixSec;
                        newCloud["on_time"] = isOt;
                        newCloud["status"] = isOt ? "ON TIME ⚔️" : "LATE RISE ⚠️";
                        newCloud["method"] = "DESKTOP_VERIFIED";
                        newCloud["caption"] = "Conquered via WAKY Desktop";
                        cloudLogsList.Add(newCloud);
                    }
                }

                // Re-sort local by date
                localList.Sort(delegate(Dictionary<string, object> a, Dictionary<string, object> b) {
                    string da = a.ContainsKey("date") ? a["date"].ToString() : "";
                    string db = b.ContainsKey("date") ? b["date"].ToString() : "";
                    return db.CompareTo(da);
                });

                // Write back local
                File.WriteAllText(localRecPath, serializer.Serialize(localList), Encoding.UTF8);

                // Update cloud
                cloudObj["logs"] = cloudLogsList;
                cloudObj["total_wakes"] = cloudLogsList.Count;
                int streak = CalculateStreakFromLogs(cloudLogsList);
                cloudObj["current_streak"] = streak;
                int currentBest = 0;
                if (cloudObj.ContainsKey("best_streak") && cloudObj["best_streak"] != null)
                {
                    int.TryParse(cloudObj["best_streak"].ToString(), out currentBest);
                }
                if (streak > currentBest) cloudObj["best_streak"] = streak;

                int onTimeCount = 0;
                foreach (var o in cloudLogsList)
                {
                    var dict = o as Dictionary<string, object>;
                    if (dict != null)
                    {
                        object ot = dict.ContainsKey("on_time") ? dict["on_time"] : (dict.ContainsKey("status") ? dict["status"] : null);
                        if (SafeToBool(ot, true)) onTimeCount++;
                    }
                }
                cloudObj["total_on_time"] = onTimeCount;

                // Sync 3 Prime Directives between Desktop and Cloud
                try
                {
                    if (File.Exists(directivesFile))
                    {
                        string localDirJson = File.ReadAllText(directivesFile, Encoding.UTF8);
                        var localDirs = serializer.Deserialize<Dictionary<string, object>>(localDirJson);
                        if (cloudObj.ContainsKey("directives") && cloudObj["directives"] is Dictionary<string, object>)
                        {
                            var cloudDirs = (Dictionary<string, object>)cloudObj["directives"];
                            string localDate = localDirs != null && localDirs.ContainsKey("date") && localDirs["date"] != null ? localDirs["date"].ToString() : "";
                            string cloudDate = cloudDirs.ContainsKey("date") && cloudDirs["date"] != null ? cloudDirs["date"].ToString() : "";
                            if (localDate == cloudDate)
                            {
                                localDirs["items"] = cloudDirs["items"];
                                SaveFileAtomic(directivesFile, serializer.Serialize(localDirs));
                            }
                            else if (!string.IsNullOrEmpty(localDate))
                            {
                                cloudObj["directives"] = localDirs;
                            }
                        }
                        else if (localDirs != null)
                        {
                            cloudObj["directives"] = localDirs;
                        }
                    }
                }
                catch { }

                // Sync Config (Weekend Mode, Blood Pact, Target Times) between Desktop and Cloud
                try
                {
                    if (File.Exists(configFile))
                    {
                        string localCfgJson = File.ReadAllText(configFile, Encoding.UTF8);
                        var localCfg = serializer.Deserialize<Dictionary<string, object>>(localCfgJson);
                        if (localCfg != null)
                        {
                            bool cfgChanged = false;

                            // 1. Target Time
                            if (cloudObj.ContainsKey("target_time") && cloudObj["target_time"] != null && !string.IsNullOrEmpty(cloudObj["target_time"].ToString()))
                            {
                                string cTarget = cloudObj["target_time"].ToString();
                                string lTarget = localCfg.ContainsKey("targetTime") && localCfg["targetTime"] != null ? localCfg["targetTime"].ToString() : "";
                                if (!string.IsNullOrEmpty(lTarget) && lTarget != cTarget)
                                {
                                    cloudObj["target_time"] = lTarget;
                                }
                                else if (string.IsNullOrEmpty(lTarget))
                                {
                                    localCfg["targetTime"] = cTarget;
                                    cfgChanged = true;
                                }
                            }
                            else if (localCfg.ContainsKey("targetTime") && localCfg["targetTime"] != null)
                            {
                                cloudObj["target_time"] = localCfg["targetTime"];
                            }

                            // 2. Weekend Mode
                            if (localCfg.ContainsKey("weekendEnabled"))
                            {
                                cloudObj["weekend_enabled"] = SafeToBool(localCfg["weekendEnabled"], false);
                            }
                            else if (cloudObj.ContainsKey("weekend_enabled"))
                            {
                                localCfg["weekendEnabled"] = SafeToBool(cloudObj["weekend_enabled"], false);
                                cfgChanged = true;
                            }

                            if (localCfg.ContainsKey("weekendTargetTime") && localCfg["weekendTargetTime"] != null)
                            {
                                cloudObj["weekend_target_time"] = localCfg["weekendTargetTime"].ToString();
                            }
                            else if (cloudObj.ContainsKey("weekend_target_time") && cloudObj["weekend_target_time"] != null)
                            {
                                localCfg["weekendTargetTime"] = cloudObj["weekend_target_time"].ToString();
                                cfgChanged = true;
                            }

                            // 3. Spartan Blood Pact
                            if (cloudObj.ContainsKey("blood_pact") && cloudObj["blood_pact"] is Dictionary<string, object>)
                            {
                                var cloudPact = (Dictionary<string, object>)cloudObj["blood_pact"];
                                if (localCfg.ContainsKey("bloodPact") && localCfg["bloodPact"] is Dictionary<string, object>)
                                {
                                    var localPact = (Dictionary<string, object>)localCfg["bloodPact"];
                                    string cStatus = cloudPact.ContainsKey("status") && cloudPact["status"] != null ? cloudPact["status"].ToString() : "ACTIVE";
                                    string lStatus = localPact.ContainsKey("status") && localPact["status"] != null ? localPact["status"].ToString() : "ACTIVE";
                                    if (cStatus != lStatus)
                                    {
                                        localPact["status"] = cStatus;
                                        if (cloudPact.ContainsKey("breached_at")) localPact["breachedAt"] = cloudPact["breached_at"];
                                        if (cloudPact.ContainsKey("fulfilled_at")) localPact["fulfilledAt"] = cloudPact["fulfilled_at"];
                                        cfgChanged = true;
                                    }
                                    if (localPact.ContainsKey("pledge") && localPact["pledge"] != null && localPact["pledge"].ToString() != "")
                                    {
                                        cloudPact["pledge"] = localPact["pledge"];
                                    }
                                }
                                else
                                {
                                    localCfg["bloodPact"] = cloudPact;
                                    cfgChanged = true;
                                }
                            }
                            else if (localCfg.ContainsKey("bloodPact") && localCfg["bloodPact"] is Dictionary<string, object>)
                            {
                                cloudObj["blood_pact"] = localCfg["bloodPact"];
                            }

                            if (cfgChanged)
                            {
                                SaveFileAtomic(configFile, serializer.Serialize(localCfg));
                            }
                        }
                    }
                }
                catch (Exception ex)
                {
                    Log("Config sync error in Merge: " + ex.Message);
                }

                File.WriteAllText(cloudMemPath, serializer.Serialize(cloudObj), Encoding.UTF8);
            }
            catch (Exception ex)
            {
                Log("MergeCloudAndLocal error: " + ex.Message);
            }
        }

        private static bool SafeToBool(object obj, bool defVal)
        {
            if (obj == null) return defVal;
            if (obj is bool) return (bool)obj;
            string s = obj.ToString().ToLower().Trim();
            if (s == "true" || s == "1" || s == "yes") return true;
            if (s == "false" || s == "0" || s == "no") return false;
            if (s.Contains("on-time") || s.Contains("on time") || s.Contains("conquered") || s.Contains("early")) return true;
            if (s.Contains("late")) return false;
            return defVal;
        }

        private static void SendBytes(HttpListenerContext ctx, byte[] bytes, string contentType, int statusCode)
        {
            try
            {
                ctx.Response.StatusCode = statusCode;
                ctx.Response.ContentType = contentType;
                ctx.Response.ContentLength64 = bytes.Length;
                ctx.Response.OutputStream.Write(bytes, 0, bytes.Length);
                ctx.Response.OutputStream.Flush();
                ctx.Response.OutputStream.Close();
            }
            catch { }
            finally
            {
                try { ctx.Response.Close(); } catch { }
            }
        }
    }
}
