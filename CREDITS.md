# 素材与依赖

游戏角色、山体、雪松、木屋、雪板、企鹅、金币、道具和界面图标均由本项目的几何代码生成。所有音效均使用 Web Audio 在本地合成，未使用商业游戏的图片、模型或录音。

## 写实材质 / Poly Haven

以下素材为 [Poly Haven](https://polyhaven.com/) 发布的 [CC0-1.0 公共领域素材](https://polyhaven.com/license)，可修改和再分发。它们仍是公共领域素材，不宣称为本项目原创。只分发本地加工后的贴图和 2K HDR；不加载该网站的预览图或商业模型。

| 素材 | 作者 | 用途 |
| --- | --- | --- |
| [Snow 02](https://polyhaven.com/a/snow_02) | Rob Tuytel | 雪地颜色、法线、环境遮蔽/粗糙度 |
| [Rock 04](https://polyhaven.com/a/rock_04) | Rob Tuytel | 山岩三向投射与坡向积雪 |
| [Bark Brown 01](https://polyhaven.com/a/bark_brown_01) | Rob Tuytel | 树皮与横木 |
| [Wood Planks Grey](https://polyhaven.com/a/wood_planks_grey) | Rob Tuytel | 风化木屋 |
| [Pine Tree 01](https://polyhaven.com/a/pine_tree_01) | Rico Cilliers / Rob Tuytel | 针叶图集；几何为本项目程序生成，使用图集左上针叶区 UV |
| [Denim Fabric 05](https://polyhaven.com/a/denim_fabric_05) | Rico Cilliers / colormass | 服装的细织纹法线与粗糙度，不使用牛仔颜色 |
| [Passendorf Snow](https://polyhaven.com/a/passendorf_snow) | Grzegorz Wronkowski | 冬季 HDR 环境反射 |

`public/materials/manifest.json` 记录原始 URL、作者、发布信息、源 MD5、源及输出 SHA-256、处理方式、色彩空间和各档文件体积。`scripts/fetch-materials.mjs` 通过官方有限资源接口重新获取这些素材，校验源文件后，生成 1K/2K/4K 版本。颜色采用 WebP quality 90；法线、ARM 和透明遮罩采用无损 WebP，法线使用 OpenGL 约定，数据贴图不做 sRGB 转换。HDR 保持 Radiance 原始数据。

近景雪岩最高 4K，其他表面最高 2K。原始下载缓存在 `work/material-originals`，不作为应用分发文件。运行时不联系 Poly Haven。

## 依赖

- [Three.js](https://threejs.org/)：3D 渲染库，MIT 许可证。版权和完整许可见 `node_modules/three/LICENSE`。
- [Vite](https://vite.dev/)：开发服务器与打包工具，MIT 许可证。完整许可见 `node_modules/vite/LICENSE.md`。
- [Barlow Condensed](https://github.com/google/fonts/tree/main/ofl/barlowcondensed)：英文标题与数字字体，由 Jeremy Tribby 设计，SIL Open Font License 1.1。字体以 WOFF2 保存于 `public/fonts`，完整许可见 `public/fonts/OFL.txt`。原始分发来自 Google Fonts。
- 中文字体使用操作系统提供的 Microsoft YaHei 和系统后备字体，不分发系统字体文件。
- [Playwright](https://playwright.dev/)：浏览器验证，Apache-2.0，开发依赖。
- [Sharp](https://sharp.pixelplumbing.com/)：离线贴图加工，Apache-2.0，开发依赖；运行时不引入页面。

本作是独立的原创滑雪跑酷游戏，与《滑雪大冒险 / Ski Safari》的权利人无关联。
