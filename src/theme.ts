import type { Plugin } from "@opencode-ai/plugin/tui";

export type MiniTheme = ReturnType<typeof buildMiniTheme>;

export function buildMiniTheme(theme: Plugin.Context["theme"]) {
  const feedback = theme.text.feedback;
  const action = theme.text.action;

  return {
    text: theme.text.default,
    textMuted: theme.text.subdued,
    primary: action.primary.default,
    secondary: action.secondary.default,
    error: feedback.error.default,
    warning: feedback.warning.default,
    info: feedback.info.default,
    backgroundPanel: theme.background.surface.overlay,
    borderSubtle: theme.background.surface.offset,
    border: theme.border.default,
    markdownHeading: theme.markdown.heading,
    markdownStrong: theme.markdown.strong,
    markdownEmph: theme.markdown.emphasis,
    markdownLink: theme.markdown.link,
    markdownLinkText: theme.markdown.linkText,
    markdownCode: theme.markdown.code,
    markdownCodeBlock: theme.markdown.codeBlock,
    markdownBlockQuote: theme.markdown.blockQuote,
    markdownText: theme.markdown.text,
    syntaxComment: theme.syntax.comment,
    syntaxKeyword: theme.syntax.keyword,
    syntaxFunction: theme.syntax.function,
    syntaxVariable: theme.syntax.variable,
    syntaxString: theme.syntax.string,
    syntaxNumber: theme.syntax.number,
    syntaxType: theme.syntax.type,
    syntaxOperator: theme.syntax.operator,
    syntaxPunctuation: theme.syntax.punctuation,
  } as const;
}
