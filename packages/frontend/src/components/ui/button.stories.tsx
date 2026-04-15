import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./button";

const meta: Meta<typeof Button> = {
  component: Button,
};

export default meta;

type Story = StoryObj<typeof Button>;

export const Default: Story = { args: { children: "Label" } };
export const Ghost: Story = { args: { children: "Ghost", variant: "ghost" } };
export const Destructive: Story = {
  args: { children: "Delete", variant: "destructive" },
};
export const Outline: Story = {
  args: { children: "Outline", variant: "outline" },
};
