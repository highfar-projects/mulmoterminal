/** The translator a pure helper is handed so it can word a message without an i18n instance of its
 *  own: vue-i18n's `t` in a component, the global one in a spec. */
export type Translate = (key: string, named: Record<string, unknown>) => string;
