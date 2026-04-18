import type { Meta, StoryObj } from "@storybook/react-vite";
import { MetadataList, MetadataProperty } from "./metadata-property";

const meta: Meta<typeof MetadataProperty> = {
  component: MetadataProperty,
};

export default meta;

type Story = StoryObj<typeof MetadataProperty>;

export const Single: Story = {
  render: () => <MetadataProperty label="Pool" value="main" />,
};

export const List: Story = {
  render: () => (
    <MetadataList>
      <MetadataProperty label="Pool" value="main" />
      <MetadataProperty label="Status" value="ready" />
      <MetadataProperty label="Created" value="2026-04-16" />
    </MetadataList>
  ),
};
