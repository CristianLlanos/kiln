# Kiln shell integration for fish
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
if set -q KILN_SHELL_INTEGRATION
    return
end
set -g KILN_SHELL_INTEGRATION 1

# Track whether a command has started (for D marker gating)
set -g __kiln_command_started ""

# Emit OSC escape sequence helper
function __kiln_osc
    printf '\e]%s\e\\' $argv[1]
end

# Report current working directory via OSC 7
function __kiln_report_cwd
    printf '\e]7;file://%s%s\e\\' (hostname) $PWD
end

# Wrap the existing fish_prompt to inject markers.
# Save the original prompt function if it exists.
if functions -q fish_prompt
    functions -c fish_prompt __kiln_original_fish_prompt
else
    function __kiln_original_fish_prompt
        echo '> '
    end
end

function fish_prompt
    set -l exit_code $status

    # D marker — command finished (skip on first prompt when no command has run)
    if test -n "$__kiln_command_started"
        __kiln_osc "133;D;$exit_code"
        set -g __kiln_command_started ""
    end

    # Report cwd
    __kiln_report_cwd

    # A marker — prompt start
    __kiln_osc "133;A"

    # Run the original prompt
    __kiln_original_fish_prompt

    # B marker — prompt end / input start
    __kiln_osc "133;B"
end

# preexec — fires after the user presses Enter, before the command executes.
function __kiln_preexec --on-event fish_preexec
    set -g __kiln_command_started 1

    # C marker — command start
    __kiln_osc "133;C"
end
