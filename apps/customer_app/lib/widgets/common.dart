// مكوّنات نظام التصميم — أي شاشة لازم تستخدم دول بدل ما تعيد تنسيق نفس الحاجة.
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../core/format.dart' as fmt;
import '../core/theme.dart';

/// هيدر أبيض: زر رجوع + عنوان (+ حاجة على الشمال) — نفس هيدر التصميم.
class QHeader extends StatelessWidget implements PreferredSizeWidget {
  const QHeader({super.key, required this.title, this.trailing, this.bottom, this.subtitle});

  final String title;
  final Widget? trailing;

  /// صف إضافي تحت العنوان (شرائح فلترة / تبويبات).
  final Widget? bottom;

  /// سطر صغير تحت العنوان (حالة الطلب مثلاً).
  final Widget? subtitle;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
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
                  const QBackButton(),
                  const SizedBox(width: 12),
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
            ? 118
            : subtitle != null
                ? 88
                : 70,
      );
}

class QBackButton extends StatelessWidget {
  const QBackButton({super.key, this.onTap, this.light = false});

  final VoidCallback? onTap;

  /// نسخة فاتحة فوق الصور والخرايط.
  final bool light;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap ?? () => Navigator.of(context).maybePop(),
      borderRadius: BorderRadius.circular(QRadius.sm),
      child: Container(
        width: 38,
        height: 38,
        decoration: BoxDecoration(
          color: light ? Colors.white.withValues(alpha: 0.92) : QColors.chip,
          borderRadius: BorderRadius.circular(QRadius.sm),
          boxShadow: light ? kCardShadow : null,
        ),
        child: const Icon(Icons.arrow_back, size: 20, color: QColors.ink),
      ),
    );
  }
}

/// زر أساسي أصفر (أو أسود/محدّد).
enum QButtonStyle { brand, dark, outline }

class QButton extends StatelessWidget {
  const QButton({
    super.key,
    required this.label,
    this.onPressed,
    this.style = QButtonStyle.brand,
    this.trailing,
    this.leading,
    this.enabled = true,
  });

  final String label;
  final VoidCallback? onPressed;
  final QButtonStyle style;

  /// نص/سعر على الطرف التاني (زر «تأكيد الطلب · 59.90 ر.س»).
  final Widget? trailing;
  final Widget? leading;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final (bg, fg, border) = switch (style) {
      QButtonStyle.brand => (QColors.brand, QColors.ink, null),
      QButtonStyle.dark => (QColors.ink, QColors.brand, null),
      QButtonStyle.outline => (QColors.surface, QColors.ink, QColors.border),
    };

    return Opacity(
      opacity: enabled ? 1 : 0.45,
      child: Material(
        color: bg,
        borderRadius: BorderRadius.circular(QRadius.lg),
        child: InkWell(
          onTap: enabled ? onPressed : null,
          borderRadius: BorderRadius.circular(QRadius.lg),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 15),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(QRadius.lg),
              border: border == null ? null : Border.all(color: border, width: 1.5),
            ),
            child: Row(
              mainAxisAlignment:
                  trailing == null ? MainAxisAlignment.center : MainAxisAlignment.spaceBetween,
              children: [
                if (leading != null) ...[leading!, const SizedBox(width: 8)],
                Text(label, style: QText.button.copyWith(color: fg)),
                if (trailing != null) trailing!,
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// شريحة فلترة/تبويب — مفعّلة = صفرا (أو سودا فوق خلفية سودا).
class QChip extends StatelessWidget {
  const QChip({
    super.key,
    required this.label,
    this.selected = false,
    this.onTap,
    this.onDark = false,
    this.trailing,
  });

  final String label;
  final bool selected;
  final VoidCallback? onTap;

  /// الشريحة جوّه هيدر أسود.
  final bool onDark;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final bg = selected
        ? QColors.brand
        : onDark
            ? QColors.inkSoft
            : QColors.chip;
    final fg = selected
        ? QColors.ink
        : onDark
            ? const Color(0xFFCFCFCF)
            : QColors.label;

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(QRadius.pill),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
        decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(QRadius.pill)),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              label,
              style: TextStyle(
                fontFamily: 'Cairo',
                fontSize: 12.5,
                fontWeight: selected ? FontWeight.w800 : FontWeight.w700,
                color: fg,
              ),
            ),
            if (trailing != null) ...[const SizedBox(width: 6), trailing!],
          ],
        ),
      ),
    );
  }
}

/// السعر: الرقم بخط Outfit و«ر.س» بخط Cairo أصغر — زي التصميم بالظبط.
class QPrice extends StatelessWidget {
  const QPrice({
    super.key,
    required this.value,
    this.size = 15,
    this.color = QColors.ink,
    this.showCurrency = true,
    this.strikethrough = false,
  });

  final double value;
  final double size;
  final Color color;
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
                    fontSize: size * 0.78,
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

/// بادچ التقييم: خلفية سودا ونص أصفر «4.8 ★».
class QRatingPill extends StatelessWidget {
  const QRatingPill({super.key, required this.rating});

  final double rating;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration:
          BoxDecoration(color: QColors.ink, borderRadius: BorderRadius.circular(QRadius.sm - 2)),
      child: Text('${fmt.rating(rating)} ★', style: QText.num(size: 13, color: QColors.brand)),
    );
  }
}

/// شارة فوق صورة الكارت («الأكثر طلباً» / «-30%»).
class QBadge extends StatelessWidget {
  const QBadge({super.key, required this.label, this.color = QColors.brand, this.textColor});

  final String label;
  final Color color;
  final Color? textColor;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
      decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(QRadius.pill)),
      child: Text(
        label,
        style: TextStyle(
          fontFamily: 'Cairo',
          fontSize: 11.5,
          fontWeight: FontWeight.w800,
          color: textColor ?? QColors.ink,
        ),
      ),
    );
  }
}

/// كارت أبيض بالظل والراديوس المعتمدين.
class QCard extends StatelessWidget {
  const QCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(16),
    this.onTap,
    this.selected = false,
    this.radius = QRadius.lg,
    this.color = QColors.surface,
  });

  final Widget child;
  final EdgeInsets padding;
  final VoidCallback? onTap;

  /// محدّد = إطار أصفر (اختيار عنوان/طريقة دفع).
  final bool selected;
  final double radius;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: color,
      borderRadius: BorderRadius.circular(radius),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(radius),
        child: Container(
          padding: padding,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(radius),
            border: selected ? Border.all(color: QColors.brand, width: 2) : null,
          ),
          child: child,
        ),
      ),
    );
  }
}

/// صف في قائمة (حسابي / الإعدادات): أيقونة + عنوان + سهم.
class QListTile extends StatelessWidget {
  const QListTile({
    super.key,
    required this.title,
    this.emoji,
    this.icon,
    this.trailing,
    this.onTap,
    this.showChevron = true,
  });

  final String title;
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
              Text(emoji!, style: const TextStyle(fontSize: 18)),
              const SizedBox(width: 12),
            ] else if (icon != null) ...[
              Icon(icon, size: 20, color: QColors.ink),
              const SizedBox(width: 12),
            ],
            Expanded(
              child: Text(
                title,
                style: const TextStyle(
                  fontFamily: 'Cairo',
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: QColors.ink,
                ),
              ),
            ),
            if (trailing != null) trailing!,
            if (showChevron) const Icon(Icons.chevron_right, size: 20, color: QColors.hint),
          ],
        ),
      ),
    );
  }
}

/// مجموعة صفوف بيضا بينها فواصل — زي كروت الإعدادات.
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
            if (i != children.length - 1) const Divider(color: QColors.chip, height: 1),
          ],
        ],
      ),
    );
  }
}

/// عدّاد الكمية − 1 +
class QQuantityStepper extends StatelessWidget {
  const QQuantityStepper({
    super.key,
    required this.quantity,
    required this.onIncrement,
    required this.onDecrement,
    this.compact = false,
  });

  final int quantity;
  final VoidCallback onIncrement;
  final VoidCallback onDecrement;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.symmetric(horizontal: compact ? 11 : 14, vertical: compact ? 7 : 10),
      decoration: BoxDecoration(
        color: compact ? const Color(0xFFF7F5EE) : QColors.surface,
        borderRadius: BorderRadius.circular(compact ? QRadius.sm : QRadius.md),
        border: compact ? null : Border.all(color: QColors.border, width: 1.5),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          InkWell(
            onTap: onDecrement,
            child: const Icon(Icons.remove, size: 18, color: QColors.hint),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: Text('$quantity', style: QText.num(size: compact ? 14 : 16)),
          ),
          InkWell(
            onTap: onIncrement,
            child: const Icon(Icons.add, size: 18, color: QColors.ink),
          ),
        ],
      ),
    );
  }
}

/// زر «+» الأصفر الصغير فوق صورة الصنف.
class QAddButton extends StatelessWidget {
  const QAddButton({super.key, this.onTap, this.size = 28});

  final VoidCallback? onTap;
  final double size;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(10),
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(color: QColors.brand, borderRadius: BorderRadius.circular(10)),
        child: Icon(Icons.add, size: size * 0.62, color: QColors.ink),
      ),
    );
  }
}

/// سويتش الإعدادات (أصفر/رمادي).
class QSwitch extends StatelessWidget {
  const QSwitch({super.key, required this.value, this.onChanged});

  final bool value;
  final ValueChanged<bool>? onChanged;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onChanged == null ? null : () => onChanged!(!value),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 160),
        width: 46,
        height: 26,
        padding: const EdgeInsets.all(3),
        decoration: BoxDecoration(
          color: value ? QColors.brand : QColors.border,
          borderRadius: BorderRadius.circular(QRadius.pill),
        ),
        child: Align(
          alignment: value ? Alignment.centerLeft : Alignment.centerRight,
          child: Container(
            width: 20,
            height: 20,
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

/// راديو/تشيك دايري بنفس ستايل التصميم (حلقة صفرا سميكة).
class QRadioDot extends StatelessWidget {
  const QRadioDot({super.key, required this.selected});

  final bool selected;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 20,
      height: 20,
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

/// مربع اختيار أصفر بعلامة ✓.
class QCheckBox extends StatelessWidget {
  const QCheckBox({super.key, required this.checked});

  final bool checked;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 22,
      height: 22,
      decoration: BoxDecoration(
        color: checked ? QColors.brand : null,
        borderRadius: BorderRadius.circular(7),
        border: checked ? null : Border.all(color: const Color(0xFFD8D6CE), width: 2),
      ),
      child: checked ? const Icon(Icons.check, size: 15, color: QColors.ink) : null,
    );
  }
}

/// حقل إدخال بستايل التصميم (حد رمادي، وأصفر لما يتفعّل).
class QField extends StatelessWidget {
  const QField({
    super.key,
    required this.hint,
    this.label,
    this.controller,
    this.keyboardType,
    this.maxLines = 1,
    this.textDirection,
    this.onChanged,
    this.inputFormatters,
  });

  final String hint;
  final String? label;
  final TextEditingController? controller;
  final TextInputType? keyboardType;
  final int maxLines;

  /// حط `TextDirection.ltr` للحقول اللاتينية/الرقمية (إيميل، تاريخ، بطاقة).
  final TextDirection? textDirection;
  final ValueChanged<String>? onChanged;
  final List<TextInputFormatter>? inputFormatters;

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
          maxLines: maxLines,
          textDirection: textDirection,
          inputFormatters: inputFormatters,
          onChanged: onChanged,
          // الحقول اللاتينية (إيميل/تاريخ/بطاقة) بخط Outfit زي باقي الأرقام في التطبيق.
          style: textDirection == TextDirection.ltr
              ? QText.num(size: 14, weight: FontWeight.w700)
              : const TextStyle(
                  fontFamily: 'Cairo',
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: QColors.ink,
                ),
          decoration: InputDecoration(
            hintText: hint,
            // من غير ده الـ hint بيتحاذى يمين والنص المكتوب شمال.
            hintTextDirection: textDirection,
            hintStyle: textDirection == TextDirection.ltr
                ? QText.num(size: 14, weight: FontWeight.w600, color: QColors.hint)
                : null,
          ),
        ),
      ],
    );
  }
}

/// صورة من الشبكة بتحميل هادي (بلاسهولدر رمادي).
class QImage extends StatelessWidget {
  const QImage({super.key, required this.url, this.radius = 0, this.width, this.height});

  final String url;
  final double radius;
  final double? width;
  final double? height;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: CachedNetworkImage(
        imageUrl: url,
        width: width,
        height: height,
        fit: BoxFit.cover,
        placeholder: (_, __) => Container(color: QColors.chip),
        errorWidget: (_, __, ___) => Container(
          color: QColors.chip,
          child: const Icon(Icons.restaurant, color: QColors.hint),
        ),
      ),
    );
  }
}

/// حالة فاضية (مفضلة فاضية، مفيش نتايج…).
class QEmpty extends StatelessWidget {
  const QEmpty({super.key, required this.message, this.emoji = '🤍'});

  final String message;
  final String emoji;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: QColors.tint,
        borderRadius: BorderRadius.circular(QRadius.lg),
        border: Border.all(
          color: QColors.brandDeep,
          width: 1.5,
          strokeAlign: BorderSide.strokeAlignInside,
        ),
      ),
      child: Text(
        '$emoji  $message',
        textAlign: TextAlign.center,
        style: const TextStyle(
          fontFamily: 'Cairo',
          fontSize: 13.5,
          fontWeight: FontWeight.w700,
          color: QColors.goldDeep,
        ),
      ),
    );
  }
}

/// شريط سفلي ثابت (زر أساسي فوق خلفية الشاشة) — مستخدم في السلة والدفع والصنف.
/// أي رقم أو نص لاتيني جوّه سياق عربي (‎#QF-20481‎ · ‎-11.40‎ · ‎+4‎ · ‎25-35 min‎)
/// لازم يتلف بده، وإلا الـ bidi بيقلبه (بيبقى «20481-QF#»).
class QLtr extends StatelessWidget {
  const QLtr({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) =>
      Directionality(textDirection: TextDirection.ltr, child: child);
}

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
        12 + MediaQuery.of(context).padding.bottom,
      ),
      child: child,
    );
  }
}
