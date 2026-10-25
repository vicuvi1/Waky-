"""Native Windows notifications (toasts) with action buttons.

Buttons open a local link like http://127.0.0.1:48990/act?do=bed&k=<secret>, which Waky handles,
so "Going to bed" or "Still up" works straight from the notification.
"""

import base64
import subprocess
import sys
from xml.sax.saxutils import escape, quoteattr

# PowerShell's own app id: lets a script show toasts without registering an app.
APP_ID = "{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe"


def toast_xml(title, body, actions=(), sticky=False):
    buttons = "".join(f"<action content={quoteattr(label)} activationType=\"protocol\" arguments={quoteattr(url)}/>"
                      for label, url in actions)
    scenario = ' scenario="reminder"' if sticky and actions else ""
    return (f"<toast{scenario}><visual><binding template=\"ToastGeneric\"><text>{escape(title)}</text>"
            f"<text>{escape(body)}</text></binding></visual>"
            f"{'<actions>' + buttons + '</actions>' if buttons else ''}<audio silent=\"true\"/></toast>")


def show(title, body, actions=(), sticky=False):
    """Show a toast. Fails quietly: a missed notification must never break Waky."""
    if sys.platform != "win32":
        return False
    xml = toast_xml(title, body, actions, sticky).replace("'", "''")
    script = (
        "[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null;"
        "[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] > $null;"
        "$x = New-Object Windows.Data.Xml.Dom.XmlDocument;"
        f"$x.LoadXml('{xml}');"
        f"[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('{APP_ID}')"
        ".Show([Windows.UI.Notifications.ToastNotification]::new($x))"
    )
    encoded = base64.b64encode(script.encode("utf-16-le")).decode()
    try:
        subprocess.Popen(["powershell", "-NoProfile", "-WindowStyle", "Hidden", "-EncodedCommand", encoded],
                         creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        return True
    except OSError:
        return False
