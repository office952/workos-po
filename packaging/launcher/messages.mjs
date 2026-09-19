export const OPERATOR_MESSAGES = {
  already_running: "WorkOS rulează deja. Se deschide aplicația.",
  started: "WorkOS a pornit.",
  stopped: "WorkOS s-a oprit.",
  not_running: "WorkOS nu rulează.",
  port_busy: "Portul WorkOS este folosit de alt program. Închide acel program, apoi încearcă din nou.",
  data_inaccessible: "Folderul de date WorkOS nu poate fi folosit. Verifică drepturile de scriere.",
  database_cannot_open: "Baza de date WorkOS nu s-a putut deschide. Datele nu au fost șterse.",
  runtime_not_ready: "WorkOS nu a devenit gata. Detaliile sunt în jurnal.",
  browser_cannot_open: "WorkOS rulează, dar browserul nu s-a putut deschide.",
  backup_running: "Nu se poate face copia de rezervă cât timp WorkOS rulează. Oprește WorkOS, apoi reîncearcă.",
  backup_failed: "Copia de rezervă nu a reușit. Detaliile sunt în jurnal.",
  invalid_host: "WorkOS Local poate porni doar pe acest calculator.",
  cloud_conflict: "WorkOS Local nu poate folosi o configurare Cloud.",
  generic_failure: "WorkOS nu a putut porni. Detaliile sunt în jurnal.",
};

export function operatorMessage(code) {
  return OPERATOR_MESSAGES[code] ?? OPERATOR_MESSAGES.generic_failure;
}
