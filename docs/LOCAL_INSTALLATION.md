# Local installation

Living operator-safe contract for packaging WorkOS as a Local Windows product. This is not a Cloud cutover, not a HUB MEDIA adoption, and not an Owner-machine install authorization.

```text
WORKOS_LOCAL_INSTALLATION_V1 = IN_PROGRESS
LOCAL_SHORTCUT_LAUNCH_CLOSURE_V1 = COMPLETE_ISOLATED_SYNTHETIC
INSTALLATION_OWNER_ACCEPTED = NO
REAL_HUB_MEDIA_LOCAL_ADOPTION = HOLD
DEPLOY_REAL_OWNER_MACHINE = NO
```

See `docs/LOCAL_RUNTIME.md` for the Local runtime contract. Installation packages that same runtime. It does not create a second product.

```text
INSTALL → INITIALIZE → START WORKOS → BROWSER OPENS → OPERATE
```

## Installer technology

```text
INSTALLER_TECHNOLOGY = NODE_PACKAGE_PLUS_VBS_SHORTCUTS
INNO_SETUP = OPTIONAL_LATER
MSI = NO
ELECTRON = NO
DOCKER = NO
WSL = NO
```

V1 ships a self-contained folder produced by `pnpm package:local` (`packaging/build-package.mjs`):

- packaged Node (`runtime/node.exe`)
- compiled API and domain JavaScript
- production `node_modules` including `better-sqlite3` native bindings
- built frontend (`app/web`)
- launcher and installer scripts
- `Install WorkOS.cmd` / `Start WorkOS.cmd` / `Uninstall WorkOS.cmd`

The installer is `packaging/installer/install.mjs` running on the packaged Node. Start Menu shortcuts are created with `create-shortcut.vbs`. A Windows service is not used.

Why this instead of WiX / NSIS / MSIX / Electron:

- no extra installer toolchain for CI
- upgrade and data-preservation rules stay in one script
- the same Node that runs the product runs the installer
- later code signing can sign `node.exe`, the `.cmd` launchers, and the package
- Electron would add a second desktop shell without changing Product Truth

`packaging/installer/workos-local.iss` is a later optional Inno recipe only. V1 does not require ISCC.

## Install scope

```text
PER_USER_INSTALL = YES
PER_MACHINE_INSTALL = NO
ADMINISTRATOR_REQUIRED = NO
```

Per-user avoids Program Files ACLs and keeps Local V1 on the same implicit-Owner Windows account that uses the data.

## Layout

Application (installer-owned, replaceable):

```text
%LOCALAPPDATA%\Programs\WorkOS\
  runtime\node.exe
  app\dist\          compiled API
  app\web\           built frontend
  app\node_modules\  production dependencies
  app\product.json
  app\build.json
  launcher\
  installer\
  install-manifest.json
```

Data (user-owned, preserved across update/uninstall):

```text
%LOCALAPPDATA%\WorkOS\local\
  data\product-system.sqlite
  data\documents\
  backups\
  logs\
  config\local-profile.json
  ops\runtime-lease.json
```

```text
INSTALL_DIRECTORY = %LOCALAPPDATA%\Programs\WorkOS
DATA_DIRECTORY    = %LOCALAPPDATA%\WorkOS\local
LOG_DIRECTORY     = %LOCALAPPDATA%\WorkOS\local\logs
BACKUP_DIRECTORY  = %LOCALAPPDATA%\WorkOS\local\backups
```

Developer `pnpm local:start` still defaults to `join(homedir(), "WorkOS", "local")`. The installed launcher always sets `WORKOS_LOCAL_ROOT` to the per-user data directory above. Those defaults are not hardcoded as business truth; they are Windows path helpers.

Override for support or isolated proof:

```text
WORKOS_INSTALL_DIR
WORKOS_LOCAL_ROOT
```

Do not point those variables at a real HUB MEDIA root.

## Packaged runtime

```text
PACKAGED_NODE_RUNTIME = YES
INSTALLED_VITE = NO
INSTALLED_TSX = NO
INSTALLED_PNPM_REQUIRED = NO
INSTALLED_SOURCE_TREE_REQUIRED = NO
```

API production start is `runtime/node.exe app/dist/index.js`. It is not `tsx src/index.ts` and not `pnpm --filter @workos-final/api start`.

`@workos-final/domain` is copied as compiled `node_modules/@workos-final/domain` with `exports` pointing at `dist/index.js`. Customer machines do not resolve the pnpm workspace.

Native modules are copied from the build machine with dereference, then verified by loading `better-sqlite3` with the packaged Node. The packaged `node.exe` is the same binary that produced those bindings, so Visual Studio Build Tools are not required at install time.

```text
NATIVE_DEPENDENCY_STRATEGY = COPY_PREBUILT_WITH_MATCHING_NODE
BETTER_SQLITE3_PACKAGING = COPY_PACKAGE_TREE_PLUS_RUNTIME_VERIFY
```

Rebuild the package if the build Node major version changes.

## Launcher and lifecycle

Start Menu **WorkOS** (and optional desktop shortcut) is a user-facing `wscript.exe` shortcut. It does **not** pass `//nologo`. That option is reserved for noninteractive shortcut *creation* via `cscript.exe //nologo create-shortcut.vbs`.

```text
FINAL_USER_LAUNCH_CHAIN =
  WorkOS.lnk
  → %WINDIR%\System32\wscript.exe
  → "<hidden.vbs>" "<installDir>" start
  → packaged node.exe
  → launch.mjs
  → packaged API
```

Shortcut arguments:

```text
"<absolute hidden.vbs>" "<absolute installDir>" start
"<absolute hidden.vbs>" "<absolute installDir>" stop
```

`hidden.vbs` starts packaged Node without a visible console and waits for `launch.mjs` to finish that command. The API stays detached after start. Operator error dialogs use `wscript.exe "<show-message.vbs>" "<message>"` without `//nologo`. A WorkOS message dialog may appear. A Windows Script Host "Unknown option" dialog must not. Upgrade retires a locked `runtime` folder instead of requiring an immediate delete of a running `node.exe`.

The launcher:

1. resolves install and data paths
2. refuses `HOST` other than `127.0.0.1` and refuses `WORKOS_CLOUD_ROOT`
3. if `http://127.0.0.1:8790/api/health` is this WorkOS, reuses it and opens the browser
4. if the port is another program, stops with an operator-safe message (no kill, no random port)
5. otherwise starts one detached API process, waits for `/api/ready`, opens the default browser
6. exits; the API stays running for the Windows session

```text
WINDOWS_SERVICE_REQUIRED_FOR_V1 = NO
WINDOWS_SERVICE = DEFERRED
LOCAL_BIND = 127.0.0.1
LOOPBACK_ONLY = YES
PORT_OCCUPIED_BEHAVIOR = REUSE_IF_SAME_WORKOS_ELSE_FAIL_CLOSED
```

A service would add SYSTEM permissions, update complexity, and multi-user questions without helping the single implicit-Owner V1 model. Stop shortcut: **Oprește WorkOS**.

## Versioning

```text
PRODUCT_VERSION_SOURCE = packaging/product.json
```

Installer, launcher (`WORKOS_PRODUCT_VERSION`), `app/product.json`, `app/build.json`, and `install-manifest.json` read that file. `build.json` also stores git commit provenance. Normal operator UI does not show hashes or commit ids.

## Upgrade and uninstall

```text
UPGRADE_STRATEGY = REPLACE_APPLICATION_PRESERVE_DATA
UPGRADE_DATA_PRESERVED = YES
PRE_UPGRADE_BACKUP = YES
UNINSTALL_BEHAVIOR = REMOVE_APPLICATION_KEEP_DATA
UNINSTALL_DATA_PRESERVED = YES
```

Upgrade: stop API → reuse Local backup (`backupCli`, same SQLite `.backup()` + documents copy) → replace application files → keep data → next start runs normal migrations.

Uninstall removes the application directory and shortcuts. It does not delete `%LOCALAPPDATA%\WorkOS\local` unless the user passes `--purge-data` to `uninstall.mjs`. That is an explicit separate decision.

Failed install/upgrade does not write business rows and does not delete `data/`. Migration failure does not reset the database.

## Logging and operator errors

Logs live under the data root: `logs/launcher.log`, `logs/runtime.log`, `logs/installer.log`.

Do not log passwords, tokens, PINs, attachment bytes, or customer payloads. Operator dialogs are Romanian and avoid Node / pnpm / TypeScript / SQLite internals.

## Code signing

```text
CODE_SIGNING_CURRENT = UNSIGNED
SMARTSCREEN_EXPECTATION = UNKNOWN_PUBLISHER_WARNING_LIKELY
```

Windows SmartScreen may warn on first run of an unsigned package. That is expected until a commercial certificate signs the shipped binaries.

## Development separation

Development is unchanged:

```text
pnpm dev              Vite 127.0.0.1:5173 → API 8787
pnpm engine:dev
pnpm local:start      developer Local product mode (still needs pnpm + built dist)
pnpm package:local    produce the installed-product folder
```

Do not use the installer as the daily developer loop.

## Installation E2E

The installation proof is not complete if it only calls `launchWorkos()` from Node. The required isolated chain is:

```text
package
→ install synthetic temp root
→ inspect generated .lnk
→ execute installed hidden.vbs with the shortcut arguments
→ WorkOS starts
→ /api/health and /api/ready
→ principal routes
→ synthetic create/persist
→ stop through installed launcher
→ backup
→ upgrade
→ restart
→ persistence
→ uninstall keep-data
```

```text
INSTALLATION_E2E = PASS_ISOLATED_SYNTHETIC_WITH_REAL_ENTRYPOINT
OWNER_WSH_UNKNOWN_OPTION_REGRESSION = PASS
DIRECT_LAUNCHWORKOS_TEST = REUSE_AND_BACKUP_ONLY
```

## Clean-machine proof

Isolated proof uses OS temp directories and a stripped `PATH` (`%WINDIR%\System32`) plus packaged `node.exe`. It does not use the repo `node_modules` at runtime, global pnpm, or Cursor.

```text
CLEAN_MACHINE_PROOF = ISOLATED_DIRECTORY_STRIPPED_PATH
CLEAN_MACHINE_LIMITATIONS = NO_DISPOSABLE_WINDOWS_VM_IN_THIS_WAVE
```

A true empty Windows VM was not used. Do not treat this as `CLEAN_MACHINE = PASS`.

## Hard stops

```text
NO_CLIENT_CODE_FORK = YES
NO_HUB_MEDIA_HARDCODE = YES
SAME_PRODUCT_TRUTH_LOCAL_CLOUD = YES
FRONTEND_VISUAL_CHANGE = NO
REAL_HUB_MEDIA_LOCAL_ADOPTION = NO
REAL_CLOUD_WRITE = NO
REAL_DB_WRITE = NO
```
