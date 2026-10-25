' Starts Waky without a console window. Extra arguments (like --alarm) are passed on.
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
args = ""
For Each a In WScript.Arguments
  args = args & " " & a
Next
CreateObject("WScript.Shell").Run "pythonw """ & root & "\app\server.py""" & args, 0, False
