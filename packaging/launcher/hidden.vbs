Set shell = CreateObject("Wscript.Shell")
installDir = WScript.Arguments(0)
nodePath = installDir & "\runtime\node.exe"
launchPath = installDir & "\launcher\launch.mjs"
If WScript.Arguments.Count >= 2 Then
  command = WScript.Arguments(1)
Else
  command = "start"
End If
shell.Run """" & nodePath & """ """ & launchPath & """ " & command, 0, False
