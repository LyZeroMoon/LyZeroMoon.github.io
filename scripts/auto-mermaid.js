'use strict';

/**
 * 自动检测文章里是否含 Mermaid 图表，据此打开主题的 mermaid 开关。
 *
 * 主题配置里 post.mermaid.specific 为 true，意思是「只有 front-matter 写了
 * mermaid: true 的文章才加载 mermaid.js」。这样能避免 800KB 的脚本出现在
 * 每一篇文章里，但代价是作者必须记得手动加这个字段，忘了图表就静默不渲染。
 *
 * 这个脚本在 Markdown 渲染完成之后扫一遍 HTML，只要发现 ```mermaid 代码块
 * 或 {% mermaid %} 标签留下的标记，就自动把开关打开。作者只要照常写代码块即可。
 */

var MERMAID_RE = /<code[^>]*\bclass="[^"]*\bmermaid\b[^"]*"/i;

hexo.extend.filter.register('after_post_render', function (data) {
  if (data.mermaid) return data;
  if (MERMAID_RE.test(data.content || '')) {
    data.mermaid = true;
  }
  return data;
});
