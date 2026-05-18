import type { Meta, StoryObj } from "@storybook/react-vite";
import { ReadonlyEditor } from "./readonly-editor";

const meta: Meta<typeof ReadonlyEditor> = {
  component: ReadonlyEditor,
  args: { fontSize: 16, maxParagraphWidth: 72 },
};

export default meta;

type Story = StoryObj<typeof ReadonlyEditor>;

export const Default: Story = {
  args: { content: "# Hello\n\nThis is **bold** and _italic_ text.\n\nA second paragraph." },
};

export const Narrow: Story = {
  args: {
    content: "Narrow column rendering at 40ch width.",
    maxParagraphWidth: 40,
  },
};
