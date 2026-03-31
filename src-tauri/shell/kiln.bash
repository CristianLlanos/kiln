# Kiln shell integration for bash
# Emits OSC 133 semantic markers so Kiln can parse command boundaries.
#
# Marker reference:
#   OSC 133;A — prompt start (shell is ready, about to show prompt)
#   OSC 133;B — prompt end / input start (user is typing)
#   OSC 133;C — command start (command is executing)
#   OSC 133;D;{exit_code} — command finish (with exit code)
#
# Also emits OSC 7 for current working directory reporting.

# Guard against double-sourcing
[[ -n "$KILN_SHELL_INTEGRATION" ]] && return
KILN_SHELL_INTEGRATION=1

# Emit OSC escape sequence helper
__kiln_osc() {
  printf '\e]%s\e\\' "$1"
}

# Report current working directory via OSC 7
__kiln_report_cwd() {
  printf '\e]7;file://%s%s\e\\' "${HOSTNAME}" "${PWD}"
}

# Track whether a command has been started (for D marker gating)
__kiln_command_started=""

# Guard: the DEBUG trap fires for every command in a pipeline and for
# PROMPT_COMMAND itself.  We only want to emit the C marker once per
# command line that the user actually typed.
__kiln_preexec_fired=""

# precmd equivalent — runs via PROMPT_COMMAND after every command,
# before the next prompt is drawn.
__kiln_precmd() {
  local exit_code=$?

  # Reset the preexec guard so the next command line can fire it
  __kiln_preexec_fired=""

  # D marker — command finished (skip on first prompt when no command has run)
  if [[ -n "$__kiln_command_started" ]]; then
    __kiln_osc "133;D;${exit_code}"
    __kiln_command_started=""
  fi

  # Report cwd
  __kiln_report_cwd

  # A marker — prompt start
  __kiln_osc "133;A"
}

# preexec equivalent — fires via DEBUG trap before a command executes.
__kiln_preexec() {
  # Only fire once per command line
  if [[ -n "$__kiln_preexec_fired" ]]; then
    return
  fi

  # Don't fire for PROMPT_COMMAND itself
  if [[ "$BASH_COMMAND" == "__kiln_precmd" ]]; then
    return
  fi

  __kiln_preexec_fired=1
  __kiln_command_started=1

  # C marker — command start
  __kiln_osc "133;C"
}

__kiln_install() {
  # Append B marker to PS1 (between prompt text and user input)
  if [[ "$PS1" != *'133;B'* ]]; then
    PS1="${PS1}\[\e]133;B\e\\\]"
  fi

  # Install precmd via PROMPT_COMMAND
  if [[ -z "$PROMPT_COMMAND" ]]; then
    PROMPT_COMMAND="__kiln_precmd"
  elif [[ "$PROMPT_COMMAND" != *"__kiln_precmd"* ]]; then
    PROMPT_COMMAND="__kiln_precmd;${PROMPT_COMMAND}"
  fi

  # Install preexec via DEBUG trap
  trap '__kiln_preexec' DEBUG
}

__kiln_install
