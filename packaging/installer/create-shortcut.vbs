Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
shortcutPath = WScript.Arguments(0)
targetPath = WScript.Arguments(1)
argsFile = WScript.Arguments(2)
workingDir = WScript.Arguments(3)
description = WScript.Arguments(4)
Set stream = fso.OpenTextFile(argsFile, 1, False, 0)
argumentsText = stream.ReadAll
stream.Close
Set shortcut = shell.CreateShortcut(shortcutPath)
shortcut.TargetPath = targetPath
shortcut.Arguments = argumentsText
shortcut.WorkingDirectory = workingDir
shortcut.Description = description
shortcut.WindowStyle = 7
shortcut.Save
