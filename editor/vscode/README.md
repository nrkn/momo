# Momo for VS Code

Syntax highlighting for `.momo` files.

`syntaxes/momo.tmLanguage.json` is **generated** — do not edit it by hand. It is
built from the compiler's own token tables, so highlighting cannot drift from the
language:

```
npm run grammar          # regenerate after changing tokens.ts
npm run editor:install   # copy this folder into ~/.vscode/extensions/momo
```

Reload VS Code afterwards (Developer: Reload Window).
