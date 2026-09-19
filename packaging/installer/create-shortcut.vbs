Set shell = CreateObject("WScript.Shell")
shortcutPath = WScript.Arguments(0)
targetPath = WScript.Arguments(1)
arguments = WScript.Arguments(2)
workingDir = WScript.Arguments(3)
description = WScript.Arguments(4)
Set shortcut = shell.CreateShortcut(shortcutPath)
shortcut.TargetPath = targetPath
shortcut.Arguments = arguments
shortcut.WorkingDirectory = workingDir
shortcut.Description = description
shortcut.WindowStyle = 7
shortcut.Save
