Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
ScriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = ScriptDir

LocalApp = WshShell.ExpandEnvironmentStrings("%LOCALAPPDATA%")
PythonW = ""

If fso.FileExists(LocalApp & "\Programs\Python\Python313\pythonw.exe") Then
    PythonW = LocalApp & "\Programs\Python\Python313\pythonw.exe"
ElseIf fso.FileExists(LocalApp & "\Programs\Python\Python312\pythonw.exe") Then
    PythonW = LocalApp & "\Programs\Python\Python312\pythonw.exe"
ElseIf fso.FileExists(LocalApp & "\Programs\Python\Python311\pythonw.exe") Then
    PythonW = LocalApp & "\Programs\Python\Python311\pythonw.exe"
Else
    PythonW = "pythonw.exe"
End If

WshShell.Run """" & PythonW & """ """ & ScriptDir & "\main.py""", 0, False
