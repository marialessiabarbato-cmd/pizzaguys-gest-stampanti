#!/usr/bin/env zsh
set -euo pipefail

# Flusso interattivo: branch → status → stage → commit → push
# Uso: ./scripts/git-flow.sh

readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly CYAN='\033[0;36m'
readonly BOLD='\033[1m'
readonly NC='\033[0m'

info()  { echo -e "${CYAN}→${NC} $*"; }
ok()    { echo -e "${GREEN}✓${NC} $*"; }
warn()  { echo -e "${YELLOW}!${NC} $*"; }
err()   { echo -e "${RED}✗${NC} $*" >&2; }

confirm() {
  local prompt="$1"
  local reply
  echo -n "${BOLD}${prompt}${NC} [s/N]: "
  read -r reply
  [[ "${reply:l}" == "s" || "${reply:l}" == "si" || "${reply:l}" == "y" || "${reply:l}" == "yes" ]]
}

require_git_repo() {
  if ! git rev-parse --git-dir > /dev/null 2>&1; then
    err "Non sei in un repository Git. Esegui lo script dalla root del progetto."
    exit 1
  fi
}

step_branch() {
  local current
  current="$(git branch --show-current)"

  echo ""
  echo -e "${BOLD}━━━ Branch ━━━${NC}"
  if [[ -z "$current" ]]; then
    warn "Sei in uno stato detached HEAD (nessun branch attivo)."
    current="(detached)"
  else
    ok "Branch attuale: ${GREEN}${current}${NC}"
  fi

  echo ""
  echo "  1) Resta su questo branch"
  echo "  2) Passa a un branch esistente"
  echo "  3) Crea e passa a un nuovo branch"
  echo "  0) Annulla"
  echo ""

  local choice
  read -r "choice?Scelta: "

  case "$choice" in
    1)
      if [[ -z "$(git branch --show-current)" ]]; then
        err "Crea o seleziona un branch prima di continuare."
        exit 1
      fi
      ok "Continuo su: $(git branch --show-current)"
      ;;
    2)
      echo ""
      info "Branch locali:"
      git branch --format='  %(HEAD) %(refname:short)'
      echo ""
      local target
      read -r "target?Nome del branch: "
      if [[ -z "$target" ]]; then
        err "Nome branch obbligatorio."
        exit 1
      fi
      if ! git show-ref --verify --quiet "refs/heads/${target}"; then
        err "Il branch '${target}' non esiste."
        exit 1
      fi
      git checkout "$target"
      ok "Sei su: $(git branch --show-current)"
      ;;
    3)
      local new_branch
      read -r "new_branch?Nome del nuovo branch: "
      if [[ -z "$new_branch" ]]; then
        err "Nome branch obbligatorio."
        exit 1
      fi
      if git show-ref --verify --quiet "refs/heads/${new_branch}"; then
        warn "Il branch '${new_branch}' esiste già."
        if confirm "Vuoi passare a questo branch?"; then
          git checkout "$new_branch"
          ok "Sei su: $(git branch --show-current)"
        else
          exit 0
        fi
      else
        git checkout -b "$new_branch"
        ok "Creato e attivo: $(git branch --show-current)"
      fi
      ;;
    0)
      info "Operazione annullata."
      exit 0
      ;;
    *)
      err "Scelta non valida."
      exit 1
      ;;
  esac
}

step_status() {
  echo ""
  echo -e "${BOLD}━━━ File modificati ━━━${NC}"

  if git diff --quiet && git diff --cached --quiet && [[ -z "$(git ls-files --others --exclude-standard)" ]]; then
    warn "Nessuna modifica da committare."
    git status -sb
    exit 0
  fi

  git status -sb
  echo ""
  info "Dettaglio:"
  git status --short
}

step_stage() {
  echo ""
  echo -e "${BOLD}━━━ Aggiungi al commit ━━━${NC}"
  echo "  1) Aggiungi tutti i file (git add -A)"
  echo "  2) Aggiungi file singoli"
  echo "  3) Salta (usa solo ciò che è già in stage)"
  echo "  0) Annulla"
  echo ""

  local choice
  read -r "choice?Scelta: "

  case "$choice" in
    1)
      git add -A
      ok "Tutti i file aggiunti allo stage."
      ;;
    2)
      echo ""
      info "File non tracciati o modificati (inserisci i numeri separati da spazio, oppure 't' per tutti):"
      local -a files=()
      while IFS= read -r line; do
        files+=("$line")
      done < <(git status --short | awk '{print $2}')
      local i=1
      for f in "${files[@]}"; do
        echo "  ${i}) ${f}"
        (( i++ ))
      done
      echo ""
      local selection
      read -r "selection?Selezione: "
      if [[ "${selection:l}" == "t" ]]; then
        git add -A
        ok "Tutti i file aggiunti."
      else
        for num in ${=selection}; do
          if [[ "$num" =~ ^[0-9]+$ ]] && (( num >= 1 && num <= ${#files[@]} )); then
            git add -- "${files[$num]}"
            ok "Aggiunto: ${files[$num]}"
          else
            warn "Ignorato indice non valido: ${num}"
          fi
        done
      fi
      ;;
    3)
      info "Uso solo i file già in stage."
      ;;
    0)
      info "Operazione annullata."
      exit 0
      ;;
    *)
      err "Scelta non valida."
      exit 1
      ;;
  esac

  if git diff --cached --quiet; then
    warn "Nessun file in stage. Aggiungi almeno un file prima del commit."
    exit 1
  fi

  echo ""
  info "In stage:"
  git diff --cached --stat
}

step_commit() {
  echo ""
  echo -e "${BOLD}━━━ Commit ━━━${NC}"

  local message=""
  while [[ -z "${message// }" ]]; do
    read -r "message?Messaggio di commit: "
    if [[ -z "${message// }" ]]; then
      warn "Il messaggio non può essere vuoto."
    fi
  done

  if ! confirm "Confermi il commit?"; then
    info "Commit annullato."
    exit 0
  fi

  git commit -m "$message"
  ok "Commit creato."
}

step_push() {
  echo ""
  echo -e "${BOLD}━━━ Push ━━━${NC}"

  local branch upstream
  branch="$(git branch --show-current)"
  upstream="$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null || true)"

  info "Branch: ${branch}"
  if [[ -n "$upstream" ]]; then
    info "Upstream: ${upstream}"
  else
    warn "Nessun upstream configurato. Al push verrà usato: origin/${branch}"
  fi

  echo ""
  if ! confirm "Eseguire git push?"; then
    info "Push annullato. Il commit è salvato in locale."
    exit 0
  fi

  if [[ -n "$upstream" ]]; then
    git push
  else
    git push -u origin "$branch"
  fi

  ok "Push completato su origin/${branch}."
}

main() {
  require_git_repo
  step_branch
  step_status
  step_stage
  step_commit
  step_push
  echo ""
  ok "Fatto!"
}

main "$@"
