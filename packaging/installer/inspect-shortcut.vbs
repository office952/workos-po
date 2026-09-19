Set shell = CreateObject("WScript.Shell")
Set shortcut = shell.CreateShortcut(WScript.Arguments(0))
WScript.Echo "TargetPath|" & shortcut.TargetPath
WScript.Echo "Arguments|" & shortcut.Arguments
WScript.Echo "WorkingDirectory|" & shortcut.WorkingDirectory
WScript.Echo "WindowStyle|" & shortcut.WindowStyle
