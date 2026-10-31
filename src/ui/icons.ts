import type { ControlKey } from '../core/layout';

/**
 * 控件图标（内联 SVG）。
 *
 * ★ 为什么全部用图标：
 *   中文标签在 92px 的圆形按钮里要占到 18px 左右，两三个字就挤满，
 *   小屏上更是糊成一团；而且文字会挡住按钮的按压反馈。
 *   图标一眼可辨，也不用担心字体缺失。
 *
 * 统一用 currentColor 描边，颜色由 CSS 控制（按压时变亮）。
 */

const wrap = (body: string): string =>
  '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"'
  + ' fill="none" stroke="currentColor" stroke-width="7"'
  + ' stroke-linecap="round" stroke-linejoin="round">'
  + body + '</svg>';

export const ICONS: Record<ControlKey | 'skin', string> = {
  // 移动：四向箭头
  stick: wrap(
    '<path d="M50 20v60M20 50h60"/>'
    + '<path d="M38 32l12-12 12 12"/>'
    + '<path d="M38 68l12 12 12-12"/>'
    + '<path d="M32 38l-12 12 12 12"/>'
    + '<path d="M68 38l12 12-12 12"/>',
  ),

  // 开火：靶心
  fire: wrap(
    '<circle cx="50" cy="50" r="30"/>'
    + '<circle cx="50" cy="50" r="15"/>'
    + '<circle cx="50" cy="50" r="4" fill="currentColor" stroke="none"/>',
  ),

  // 开镜：倍镜轮廓（圆 + 十字准线 + 四角）
  ads: wrap(
    '<circle cx="50" cy="50" r="24"/>'
    + '<path d="M50 8v18M50 74v18M8 50h18M74 50h18"/>'
    + '<path d="M26 26l10 10M74 26l-10 10M26 74l10-10M74 74l-10-10"/>',
  ),

  // 跳跃：向上箭头 + 地面
  jump: wrap(
    '<path d="M50 74V28"/>'
    + '<path d="M32 46l18-18 18 18"/>'
    + '<path d="M22 84h56"/>',
  ),

  // 蹲下：向下箭头 + 地面
  crouch: wrap(
    '<path d="M50 24v50"/>'
    + '<path d="M32 56l18 18 18-18"/>'
    + '<path d="M22 84h56"/>',
  ),

  // 趴下：横向箭头（"躺倒"）+ 地面
  prone: wrap(
    '<path d="M28 62h44"/>'
    + '<path d="M60 46l14 16-14 16"/>'
    + '<path d="M22 84h56"/>',
  ),

  // 换弹：弹匣 + 向上装入箭头
  reload: wrap(
    '<path d="M34 36h32v42a4 4 0 0 1-4 4H38a4 4 0 0 1-4-4z"/>'
    + '<path d="M50 30V12"/>'
    + '<path d="M41 21l9-9 9 9"/>',
  ),

  // 切换武器：刀
  melee: wrap(
    '<path d="M32 72l30-40"/>'
    + '<path d="M62 32l9 6-6 9"/>'
    + '<path d="M26 78l11-11"/>',
  ),

  // 治疗物：医疗十字
  heal: wrap('<path d="M50 24v52M24 50h52" stroke-width="16"/>'),

  // 自定义皮肤：T 恤
  skin: wrap(
    '<path d="M36 24l14-9 14 9 13 8-6 12-7-4v38H35V40l-7 4-6-12z"/>',
  ),
};

/** 生成图标元素（已注入 SVG，颜色由 CSS 的 color 决定） */
export function iconEl(key: ControlKey | 'skin', cls = 'icon'): HTMLElement {
  const d = document.createElement('div');
  d.className = cls;
  d.innerHTML = ICONS[key] || '';
  return d;
}
