import type { Meta, StoryObj } from "@storybook/react-vite";
import { Textarea } from "./textarea";

const meta: Meta<typeof Textarea> = {
  component: Textarea,
};

export default meta;

type Story = StoryObj<typeof Textarea>;

export const Default: Story = { args: { placeholder: "Type here…", rows: 4 } };
export const Disabled: Story = { args: { placeholder: "Disabled", rows: 4, disabled: true } };
export const Invalid: Story = {
  args: { placeholder: "Invalid", rows: 4, "aria-invalid": true },
};
