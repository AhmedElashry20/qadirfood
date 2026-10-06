// مكوّنات نظام التصميم — أي شاشة تستخدمها بدل ما تعيد تنسيق نفس الحاجة.
// تطبيق الكابتن بيستخدم الوضع الداكن كتير، فمعظم المكوّنات ليها نسخة `onDark`.
import 'package:flutter/material.dart';

import '../core/format.dart' as fmt;
import '../core/theme.dart';

/// هيدر أبيض: زر رجوع + عنوان (+ حاجة على الشمال + صف شرائح تحت).
class QHeader extends StatelessWidget implements PreferredSizeWidget {
  const QHeader({
    super.key,
    required this.title,
    this.subtitle,
    this.trailing,
    this.bottom,
    this.showBack = true,
  });

  final String title;

  /// سطر صغير تحت العنوان (اسم الفرع مثلاً).
  final Widget? subtitle;
  final Widget? trailing;

  /// صف الشرائح تحت العنوان.
  final Widget? bottom;
  final bool showBack;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: QColors.surface,
        border: Border(bottom: BorderSide(color: QColors.line)),
      ),
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(QSpace.screenH, 12, QSpace.screenH, 14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  if (showBack) ...[
                    const QBackButton(),
                    const SizedBox(width: 12),
                  ],
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(title, style: QText.screenTitle),
                        if (subtitle != null) subtitle!,
                      ],
                    ),
                  ),
                  if (trailing != null) trailing!,
                ],
              ),
              if (bottom != null) ...[const SizedBox(height: 12), bottom!],
            ],
          ),
        ),
      ),
    );
  }

  @override
  Size get preferredSize => Size.fromHeight(
        bottom != null
            ? 122
            : subtitle != null
                ? 92
                : 74,
      );
}

/// هيدر أسود — شاشات الملاحة والحالة.
class QDarkHeader extends StatelessWidget implements PreferredSizeWidget {
  const QDarkHeader({super.key, required this.child, this.height = 150});

  final Widget child;
  final double height;

  @override
  Widget build(BuildContext context) {
    return Container(
      color: QColors.ink,
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(QSpace.screenH, 12, QSpace.screenH, 14),
          child: child,
        ),
      ),
    );
  }

  @override
  Size get preferredSize => Size.fromHeight(height);
}

class QBackButton extends StatelessWidget {
  const QBackButton({super.key, this.onTap, this.onDark = false});

  final VoidCallback? onTap;
  final bool onDark;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap ?? () => Navigator.of(context).maybePop(),
      borderRadius: BorderRadius.circular(QRadius.sm),
      child: Container(
        width: 40,
        height: 40,
        decoration: BoxDecoration(
          color: onDark ? QColors.inkSoft : QColors.chip,
          borderRadius: BorderRadius.circular(QRadius.sm),
        ),
        child: Icon(Icons.arrow_back, size: 20, color: onDark ? Colors.white : QColors.ink),
      ),
    );
  }
}

/// زر أساسي — الارتفاع الأدنى 56 عشان يتضغط بسرعة.
enum QButtonStyle { brand, dark, outline, danger, disabled }

class QButton extends StatelessWidget {
  const QButton({
    super.key,
    required this.label,
    this.onPressed,
    this.style = QButtonStyle.brand,
    this.leading,
    this.trailing,
    this.enabled = true,
    this.loading = false,
    this.compact = false,
  });

  final String label;
  final VoidCallback? onPressed;
  final QButtonStyle style;
  final Widget? leading;
  final Widget? trailing;
  final bool enabled;
  final bool loading;

  /// نسخة أقصر للأزرار جوّه الكروت.
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final effective = enabled && !loading ? style : QButtonStyle.disabled;

    final (bg, fg, border) = switch (effective) {
      QButtonStyle.brand => (QColors.brand, QColors.ink, null),
      QButtonStyle.dark => (QColors.ink, QColors.brand, null),
      QButtonStyle.outline => (QColors.surface, QColors.ink, QColors.border),
      QButtonStyle.danger => (QColors.surface, QColors.danger, QColors.dangerBorder),
      QButtonStyle.disabled => (QColors.border, QColors.faint, null),
    };

    return Material(
      color: bg,
      borderRadius: BorderRadius.circular(QRadius.lg),
      child: InkWell(
        onTap: enabled && !loading ? onPressed : null,
        borderRadius: BorderRadius.circular(QRadius.lg),
        child: Container(
          constraints: BoxConstraints(minHeight: compact ? 44 : QSpace.tapTarget),
          padding: EdgeInsets.symmetric(horizontal: 18, vertical: compact ? 10 : 14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(QRadius.lg),
            border: border == null ? null : Border.all(color: border, width: 1.5),
          ),
          child: Row(
            mainAxisAlignment:
                trailing == null ? MainAxisAlignment.center : MainAxisAlignment.spaceBetween,
            children: [
              if (loading) ...[
                SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2.4, color: fg),
                ),
                const SizedBox(width: 10),
              ] else if (leading != null) ...[
                leading!,
                const SizedBox(width: 8),
              ],
              Flexible(
                child: Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: QText.button.copyWith(color: fg, fontSize: compact ? 14.5 : 17),
                ),
              ),
              if (trailing != null) trailing!,
            ],
          ),
        ),
      ),
    );
  }
}

/// شريحة فلترة/تبويب — مع عدّاد اختياري.
class QChip extends StatelessWidget {
  const QChip({
    super.key,
    required this.label,
    this.count,
    this.selected = false,
    this.onTap,
    this.onDark = false,
    this.color,
  });

  final String label;
  final int? count;
  final bool selected;
  final VoidCallback? onTap;
  final bool onDark;

  /// لون نص مخصص (شرائح الحالة).
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final bg = selected
        ? QColors.brand
        : onDark
            ? QColors.inkSoft
            : QColors.chip;
    final fg = color ??
        (selected
            ? QColors.ink
            : onDark
                ? const Color(0xFFCFCFCF)
                : QColors.label);

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(QRadius.pill),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 8),
        decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(QRadius.pill)),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              label,
              style: TextStyle(
                fontFamily: 'Cairo',
                fontSize: 13,
                fontWeight: selected ? FontWeight.w800 : FontWeight.w700,
                color: fg,
              ),
            ),
            if (count != null) ...[
              const SizedBox(width: 6),
              Text('$count', style: QText.num(size: 13, color: fg)),
            ],
          ],
        ),
      ),
    );
  }
}

/// السعر: الرقم Outfit و«ر.س» Cairo أصغر.
class QPrice extends StatelessWidget {
  const QPrice({
    super.key,
    required this.value,
    this.size = 16,
    this.color,
    this.showCurrency = true,
    this.strikethrough = false,
  });

  final double value;
  final double size;
  final Color? color;
  final bool showCurrency;
  final bool strikethrough;

  @override
  Widget build(BuildContext context) {
    final deco = strikethrough ? TextDecoration.lineThrough : null;
    return Text.rich(
      TextSpan(
        text: fmt.money(value),
        style: QText.num(
          size: size,
          weight: strikethrough ? FontWeight.w600 : FontWeight.w800,
          color: color,
          decoration: deco,
        ),
        children: showCurrency
            ? [
                TextSpan(
                  text: ' ر.س',
                  style: TextStyle(
                    fontFamily: 'Cairo',
                    fontSize: size * 0.72,
                    fontWeight: FontWeight.w700,
                    color: color,
                    decoration: deco,
                  ),
                ),
              ]
            : null,
      ),
    );
  }
}

/// شارة صغيرة فوق كارت أو جنب عنوان.
class QBadge extends StatelessWidget {
  const QBadge({
    super.key,
    required this.label,
    this.color,
    this.textColor,
  });

  final String label;
  final Color? color;
  final Color? textColor;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(QRadius.pill)),
      child: Text(
        label,
        style: TextStyle(
          fontFamily: 'Cairo',
          fontSize: 11.5,
          fontWeight: FontWeight.w800,
          color: textColor,
        ),
      ),
    );
  }
}

/// كارت أبيض بالراديوس والظل المعتمدين.
class QCard extends StatelessWidget {
  const QCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(16),
    this.onTap,
    this.highlighted = false,
    this.radius = QRadius.lg,
    this.color,
    this.borderColor,
    this.glow = false,
  });

  final Widget child;
  final EdgeInsets padding;
  final VoidCallback? onTap;

  /// إطار أصفر — الطلب الجديد المطلوب الرد عليه.
  final bool highlighted;
  final double radius;
  final Color? color;
  final Color? borderColor;

  /// هالة صفرا حوالين الكارت (طلب جديد بس).
  final bool glow;

  @override
  Widget build(BuildContext context) {
    final border = borderColor ?? (highlighted ? QColors.brand : null);

    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(radius),
        boxShadow: glow
            ? const [BoxShadow(color: Color(0x26FFD200), blurRadius: 24, offset: Offset(0, 8))]
            : kCardShadow,
      ),
      child: Material(
        color: color,
        borderRadius: BorderRadius.circular(radius),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(radius),
          child: Container(
            padding: padding,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(radius),
              border: border == null ? null : Border.all(color: border, width: 2),
            ),
            child: child,
          ),
        ),
      ),
    );
  }
}

/// صف في قائمة (الإعدادات).
class QListTile extends StatelessWidget {
  const QListTile({
    super.key,
    required this.title,
    this.subtitle,
    this.emoji,
    this.icon,
    this.trailing,
    this.onTap,
    this.showChevron = true,
  });

  final String title;
  final String? subtitle;
  final String? emoji;
  final IconData? icon;
  final Widget? trailing;
  final VoidCallback? onTap;
  final bool showChevron;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        child: Row(
          children: [
            if (emoji != null) ...[
              Text(emoji!, style: const TextStyle(fontSize: 19)),
              const SizedBox(width: 12),
            ] else if (icon != null) ...[
              Icon(icon, size: 21, color: QColors.ink),
              const SizedBox(width: 12),
            ],
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: QText.body.copyWith(fontWeight: FontWeight.w800)),
                  if (subtitle != null) ...[
                    const SizedBox(height: 2),
                    Text(subtitle!, style: QText.tiny.copyWith(fontWeight: FontWeight.w600)),
                  ],
                ],
              ),
            ),
            if (trailing != null) trailing!,
            if (showChevron) Icon(Icons.chevron_right, size: 20, color: QColors.hint),
          ],
        ),
      ),
    );
  }
}

/// مجموعة صفوف بيضا بينها فواصل.
class QTileGroup extends StatelessWidget {
  const QTileGroup({super.key, required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: QColors.surface,
        borderRadius: BorderRadius.circular(QRadius.lg),
        boxShadow: kCardShadow,
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        children: [
          for (var i = 0; i < children.length; i++) ...[
            children[i],
            if (i != children.length - 1) Divider(color: QColors.chip, height: 1),
          ],
        ],
      ),
    );
  }
}

/// سويتش (أصفر/رمادي) — التوفّر وأوقات العمل.
class QSwitch extends StatelessWidget {
  const QSwitch({super.key, required this.value, this.onChanged, this.onDark = false});

  final bool value;
  final ValueChanged<bool>? onChanged;
  final bool onDark;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onChanged == null ? null : () => onChanged!(!value),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 160),
        width: 50,
        height: 28,
        padding: const EdgeInsets.all(3),
        decoration: BoxDecoration(
          color: value
              ? QColors.brand
              : onDark
                  ? QColors.inkLine
                  : QColors.border,
          borderRadius: BorderRadius.circular(QRadius.pill),
        ),
        child: Align(
          alignment: value ? Alignment.centerLeft : Alignment.centerRight,
          child: Container(
            width: 22,
            height: 22,
            decoration: BoxDecoration(
              color: value ? QColors.ink : QColors.surface,
              shape: BoxShape.circle,
            ),
          ),
        ),
      ),
    );
  }
}

/// راديو دايري بستايل التصميم.
class QRadioDot extends StatelessWidget {
  const QRadioDot({super.key, required this.selected});

  final bool selected;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 21,
      height: 21,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        border: Border.all(
          color: selected ? QColors.brand : const Color(0xFFD8D6CE),
          width: selected ? 6 : 2,
        ),
      ),
    );
  }
}

/// مربع اختيار (تحقق الأصناف قبل التعبئة).
class QCheckBox extends StatelessWidget {
  const QCheckBox({super.key, required this.checked, this.onTap});

  final bool checked;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Container(
        width: 26,
        height: 26,
        decoration: BoxDecoration(
          color: checked ? QColors.brand : null,
          borderRadius: BorderRadius.circular(8),
          border: checked ? null : Border.all(color: const Color(0xFFD8D6CE), width: 2),
        ),
        child: checked ? Icon(Icons.check, size: 17, color: QColors.ink) : null,
      ),
    );
  }
}

/// حقل إدخال بستايل التصميم.
class QField extends StatelessWidget {
  const QField({
    super.key,
    required this.hint,
    this.label,
    this.controller,
    this.keyboardType,
    this.maxLines = 1,
    this.textDirection,
    this.obscure = false,
    this.onChanged,
    this.suffix,
  });

  final String hint;
  final String? label;
  final TextEditingController? controller;
  final TextInputType? keyboardType;
  final int maxLines;
  final TextDirection? textDirection;
  final bool obscure;
  final ValueChanged<String>? onChanged;
  final Widget? suffix;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (label != null) ...[
          Text(label!, style: QText.fieldLabel),
          const SizedBox(height: 6),
        ],
        TextField(
          controller: controller,
          keyboardType: keyboardType,
          maxLines: obscure ? 1 : maxLines,
          obscureText: obscure,
          textDirection: textDirection,
          onChanged: onChanged,
          style: QText.body,
          decoration: InputDecoration(hintText: hint, suffixIcon: suffix),
        ),
      ],
    );
  }
}

/// حالة فاضية.
class QEmpty extends StatelessWidget {
  const QEmpty({super.key, required this.message, this.emoji = '🧾'});

  final String message;
  final String emoji;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(emoji, style: const TextStyle(fontSize: 44)),
            const SizedBox(height: 12),
            Text(message, textAlign: TextAlign.center, style: QText.bodyMuted),
          ],
        ),
      ),
    );
  }
}

/// حالة خطأ + إعادة محاولة — كل شاشة بتجيب بيانات بتستخدمها.
class QErrorView extends StatelessWidget {
  const QErrorView({super.key, required this.message, this.onRetry});

  final String message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('😕', style: TextStyle(fontSize: 44)),
            const SizedBox(height: 12),
            Text(message, textAlign: TextAlign.center, style: QText.bodyMuted),
            if (onRetry != null) ...[
              const SizedBox(height: 16),
              SizedBox(width: 200, child: QButton(label: 'إعادة المحاولة', onPressed: onRetry)),
            ],
          ],
        ),
      ),
    );
  }
}

/// مؤشر تحميل موحّد.
class QLoading extends StatelessWidget {
  const QLoading({super.key});

  @override
  Widget build(BuildContext context) =>
      Center(child: CircularProgressIndicator(color: QColors.brand));
}

/// شريط سفلي ثابت (زر أساسي فوق خلفية الشاشة).
class QBottomBar extends StatelessWidget {
  const QBottomBar({super.key, required this.child, this.color});

  final Widget child;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return Container(
      color: color ?? QColors.canvas,
      padding: EdgeInsets.fromLTRB(
        QSpace.screenH,
        12,
        QSpace.screenH,
        14 + MediaQuery.of(context).padding.bottom,
      ),
      child: child,
    );
  }
}

/// أي رقم/لاتيني جوّه نص عربي لازم يتلف بده وإلا الـ bidi بيقلبه.
class QLtr extends StatelessWidget {
  const QLtr({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) =>
      Directionality(textDirection: TextDirection.ltr, child: child);
}
