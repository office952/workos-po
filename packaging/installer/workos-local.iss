; Optional later Inno Setup recipe. V1 uses the Node install.mjs package
; so CI does not require the Inno compiler.
;
; If ISCC is available, compile against a previously built
; .tmp/workos-local-package directory.
;
; Required Inno behavior:
; - PrivilegesRequired=lowest (per-user)
; - DefaultDirName={localappdata}\Programs\WorkOS
; - Do not delete {localappdata}\WorkOS\local on uninstall
; - Replace application files only
;
; CODE_SIGNING can be added later with SignTool in [Setup].
