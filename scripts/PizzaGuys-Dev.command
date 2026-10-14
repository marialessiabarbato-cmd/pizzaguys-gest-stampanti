#!/usr/bin/env bash
# Doppio clic dal Finder (o dal Dock) per avviare l'ambiente di sviluppo in Terminale.
cd "$(dirname "$0")/.." && exec ./scripts/dev-up.sh
