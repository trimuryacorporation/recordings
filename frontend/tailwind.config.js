export default {
    content: ["./index.html", "./src/**/*.{js,jsx}"],
    theme: {
        extend: {
            colors: {
                ink: "#101828",
                muted: "#667085",
                line: "#d0d5dd",
                brand: "#0f766e",
                accent: "#2563eb",
                danger: "#b42318",
                warning: "#b54708",
                success: "#067647"
            },
            boxShadow: {
                soft: "0 8px 22px rgba(16,24,40,0.08)"
            }
        }
    },
    plugins: []
};
