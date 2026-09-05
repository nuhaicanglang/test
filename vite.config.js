import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    // 保留已有输出文件，遵守工作区禁止批量删除文件的约束。
    emptyOutDir: false,
    rollupOptions: { output: { manualChunks: { three: ['three'] } } },
  },
});
