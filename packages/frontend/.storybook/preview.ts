import type { Preview } from "@storybook/react-vite";
import "../src/styles/reset.css";
import "../src/styles/global.css";

const preview: Preview = {
  parameters: {
    layout: "centered",
  },
};

export default preview;
