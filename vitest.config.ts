import { defineConfig, configDefaults } from 'vitest/config'

// https://vitejs.dev/config/
export default defineConfig({
    test: {
        globalSetup: "./src/helper/testSetup.ts",
        exclude: [
            ...configDefaults.exclude, 
            "ably-common/**"
        ]
    },
});
