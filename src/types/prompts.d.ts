declare module "prompts" {
  export type PromptChoice = { title: string; value: string };
  export type PromptQuestion = {
    type: "select" | "password" | "text" | "confirm";
    name: string;
    message: string;
    choices?: PromptChoice[];
    initial?: string | boolean;
    validate?: (value: string) => true | string;
  };

  const prompts: (question: PromptQuestion) => Promise<Record<string, unknown>>;
  export default prompts;
}
