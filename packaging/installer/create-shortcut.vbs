Function ReadUnicode(path)
  Set fso = CreateObject("Scripting.FileSystemObject")
  Set file = fso.OpenTextFile(path, 1, False, -1)
  text = file.ReadAll
  file.Close
  ReadUnicode = text
End Function

Function FieldValue(text, key)
  lines = Split(Replace(text, vbCrLf, vbLf), vbLf)
  prefix = key & "|"
  For Each line In lines
    If Left(line, Len(prefix)) = prefix Then
      FieldValue = Mid(line, Len(prefix) + 1)
      Exit Function
    End If
  Next
  FieldValue = ""
End Function

props = ReadUnicode(WScript.Arguments(0))
shortcutPath = FieldValue(props, "ShortcutPath")
targetPath = FieldValue(props, "TargetPath")
argumentsText = FieldValue(props, "Arguments")
workingDir = FieldValue(props, "WorkingDirectory")
description = FieldValue(props, "Description")

Set shell = CreateObject("WScript.Shell")
Set shortcut = shell.CreateShortcut(shortcutPath)
shortcut.TargetPath = targetPath
shortcut.Arguments = argumentsText
shortcut.WorkingDirectory = workingDir
shortcut.Description = description
shortcut.WindowStyle = 7
shortcut.Save
