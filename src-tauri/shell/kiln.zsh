# Kiln shell integration for zsh
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

# Suppress the % marker zsh prints when output doesn't end with a newline
PROMPT_EOL_MARK=''

# Emit OSC escape sequence helper
__kiln_osc() {
  printf '\e]%s\e\\' "$1"
}

# Report current working directory via OSC 7
__kiln_report_cwd() {
  printf '\e]7;file://%s%s\e\\' "${HOST}" "${PWD}"
}

# precmd runs AFTER a command finishes, BEFORE the next prompt is drawn.
__kiln_precmd() {
  local exit_code=$?

  # D marker — command finished (skip on first prompt, no command has run yet)
  if [[ -n "$__kiln_command_started" ]]; then
    __kiln_osc "133;D;${exit_code}"
    unset __kiln_command_started
  fi

  # Report cwd
  __kiln_report_cwd

  # A marker — prompt start
  __kiln_osc "133;A"
}

# preexec runs AFTER the user presses Enter, BEFORE the command executes.
__kiln_preexec() {
  __kiln_command_started=1

  # C marker — command start
  __kiln_osc "133;C"
}

# Install hooks without clobbering existing ones
__kiln_install() {
  # Add B marker to the prompt itself (between prompt text and user input)
  # This marks where the prompt ends and user typing begins.
  if [[ "$PROMPT" != *'133;B'* ]]; then
    PROMPT="${PROMPT}%{\e]133;B\e\\%}"
  fi

  # Register hooks
  autoload -Uz add-zsh-hook
  add-zsh-hook precmd __kiln_precmd
  add-zsh-hook preexec __kiln_preexec
}

__kiln_install
