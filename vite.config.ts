import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import dts from 'vite-plugin-dts'

// 库构建时外部化的依赖（react 为 peer；fabric 为 dependencies，运行时从宿主环境解析）
// react/* 同时覆盖 react 与 react/jsx-runtime 等子路径导入
const isExternal = (id: string) => id === 'react' || id.startsWith('react/') || id === 'fabric'

export default defineConfig(({ command }) => {
  const isLib = command === 'build'

  return {
    plugins: [
      react(),
      dts({
        tsconfigPath: './tsconfig.json',
        outDir: 'dist/types',
        include: ['src/**/*'],
      }),
    ],
    build: isLib
      ? {
          lib: {
            entry: 'src/index.ts',
            name: 'ImageCaption',
            fileName: 'react-images-annotation',
            formats: ['es', 'umd'],
          },
          rollupOptions: {
            external: isExternal,
            output: {
              // 入口同时存在默认导出与命名导出，显式声明 named 避免 UMD 下 default 访问歧义告警
              exports: 'named',
              globals: (id: string) => (id.startsWith('react') ? 'React' : 'fabric'),
            },
          },
          outDir: 'dist',
        }
      : {
          outDir: 'dist-demo',
        },
  }
})
