using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Windows.Forms;

namespace WakyDesktop
{
    static class Program
    {
        private static string appDir = @"C:\Users\victo\.gemini\antigravity\scratch\WakyDesktop";
        private static string proofsDir;
        private static string recordsFile;
        private static string configFile;
        private static HttpListener listener;
        private static int port = 48999;
        private static DateTime lastHeartbeat = DateTime.Now;

        [STAThread]
        static void Main()
        {
            bool amIServer = false;
            try
            {
                if (!Directory.Exists(appDir))
                {
                    appDir = AppDomain.CurrentDomain.BaseDirectory;
                }
                proofsDir = Path.Combine(appDir, "proofs");
                recordsFile = Path.Combine(appDir, "wake_records.json");
                configFile = Path.Combine(appDir, "waky_config.json");

                if (!Directory.Exists(proofsDir)) Directory.CreateDirectory(proofsDir);
                if (!File.Exists(recordsFile)) File.WriteAllText(recordsFile, "[]", Encoding.UTF8);
                if (!File.Exists(configFile))
                {
                    string defConfig = "{\"targetTime\":\"07:00\",\"tgToken\":\"8814364854:AAE3HpffTsEX3x6xnl74Fx0Lff6OxOxeTeA\",\"tgChatId\":\"1900611848\",\"botUsername\":\"wakyyyy_bot\",\"paired\":true}";
                    File.WriteAllText(configFile, defConfig, Encoding.UTF8);
                }

                bool isPortOpen = IsPortInUse(port);
                if (!isPortOpen)
                {
                    StartHttpServer();
                    amIServer = true;
                }

                // Launch Chrome or Edge in App Mode
                LaunchBrowserApp();

                if (amIServer)
                {
                    lastHeartbeat = DateTime.Now;
                    while (true)
                    {
                        Thread.Sleep(3000);
                        // Stay active as long as app sends heartbeats within 10 minutes
                        if ((DateTime.Now - lastHeartbeat).TotalMinutes > 10)
                        {
                            break;
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show("Could not launch WAKY: " + ex.Message, "WAKY Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
            finally
            {
                if (amIServer && listener != null && listener.IsListening)
                {
                    try { listener.Stop(); } catch { }
                }
            }
        }

        private static bool IsPortInUse(int p)
        {
            try
            {
                using (var tcp = new TcpClient())
                {
                    var ar = tcp.BeginConnect("127.0.0.1", p, null, null);
                    bool ok = ar.AsyncWaitHandle.WaitOne(250);
                    if (ok && tcp.Connected)
                    {
                        tcp.EndConnect(ar);
                        return true;
                    }
                    return false;
                }
            }
            catch
            {
                return false;
            }
        }

        private static void LaunchBrowserApp()
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
                string args = string.Format("--app=\"{0}\" --user-data-dir=\"{1}\" --window-size=520,920 --no-first-run --no-default-browser-check", appUrl, profileDir);
                ProcessStartInfo psi = new ProcessStartInfo(browserExe, args);
                psi.UseShellExecute = true;
                Process.Start(psi);
            }
            else
            {
                Process.Start(appUrl);
            }
        }

        private static void StartHttpServer()
        {
            listener = new HttpListener();
            listener.Prefixes.Add(string.Format("http://localhost:{0}/", port));
            listener.Prefixes.Add(string.Format("http://127.0.0.1:{0}/", port));
            listener.Start();

            ThreadPool.QueueUserWorkItem((o) =>
            {
                while (listener != null && listener.IsListening)
                {
                    try
                    {
                        var context = listener.GetContext();
                        ThreadPool.QueueUserWorkItem((c) => HandleRequest((HttpListenerContext)c), context);
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
                else if (path == "/api/heartbeat")
                {
                    byte[] bytes = Encoding.UTF8.GetBytes("{\"ok\":true}");
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
                        File.WriteAllText(recordsFile, body, Encoding.UTF8);
                    }
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
