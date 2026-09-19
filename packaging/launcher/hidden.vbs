Set shell = CreateObject("Wscript.Shell")
installDir = WScript.Arguments(0)
nodePath = installDir & "\runtime\node.exe"
launchPath = installDir & "\launcher\launch.mjs"
If WScript.Arguments.Count >= 2 Then
  command = WScript.Arguments(1)
Else
  command = "start"
End If
exitCode = shell.Run("""" & nodePath & """ """ & launchPath & """ " & command & " """ & installDir & """", 0, True)
WScript.Quit exitCode
