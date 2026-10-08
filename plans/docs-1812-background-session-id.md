# docs: a conversation moved to the background continues under a new session id (#1812)

Claude Code forks the session id when a conversation is moved to the background (←). The cell keeps
the old id, so a cell reopened after its terminal ended resumes the conversation as it was at the
fork. Upstream behaviour (anthropics/claude-code#87984, #85004); this repo only documents it and how
to get the rest back (OR RESUME HERE, or `claude --resume <new id>`).

Added as an FAQ entry in `docs/guide/{en,ja}/faq.md`. No code change: following the new id through
the in-memory hook map was considered in the issue and left until upstream settles.
