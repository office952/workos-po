Function ReadUnicode(path)
  Set fso = CreateObject("Scripting.FileSystemObject")
  Set file = fso.OpenTextFile(path, 1, False, -1)
  text = file.ReadAll
  file.Close
  ReadUnicode = text
End Function

Sub WriteUnicode(path, text)
  Set fso = CreateObject("Scripting.FileSystemObject")
  Set file = fso.OpenTextFile(path, 2, True, -1)
  file.Write text
  file.Close
End Sub

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
outFile = FieldValue(props, "OutFile")
Set shell = CreateObject("WScript.Shell")
Set shortcut = shell.CreateShortcut(shortcutPath)
WriteUnicode outFile, "TargetPath|" & shortcut.TargetPath & vbCrLf & "Arguments|" & shortcut.Arguments & vbCrLf & "WorkingDirectory|" & shortcut.WorkingDirectory & vbCrLf & "WindowStyle|" & shortcut.WindowStyle & vbCrLf
