exePath = LCase(WScript.Arguments(0))
Set loc = GetObject("winmgmts:\\.\root\cimv2")
Set procs = loc.ExecQuery("SELECT ProcessId, ExecutablePath FROM Win32_Process")
For Each proc In procs
  If Not IsNull(proc.ExecutablePath) Then
    If LCase(proc.ExecutablePath) = exePath Then
      WScript.Echo proc.ProcessId
    End If
  End If
Next
