// الإعدادات والملف — بياناتي، المركبة، الوثائق، الإشعارات، الدعم، تسجيل الخروج.
// الشاشة دي بتخدم `/profile` و `/settings` مع بعض (التصميم حاططهم شاشة واحدة).
//
// ══════════════════════════════════════════════════════════════════════════
//                    إيه الحقيقي وإيه اللي مالوش مصدر هنا
// ══════════════════════════════════════════════════════════════════════════
//  ✅ **الملف الشخصي كله حقيقي** من `GET /captains/me`: الاسم والتقييم والمركبة
//     واللوحة وعدد التوصيلات وملخص الوثائق وحالة التوثيق.
//  ✅ **تعديل المركبة** — `PATCH /captains/me` (نوع المركبة واللوحة).
//  ✅ **الحسابات البنكية** — بقت في شاشة المحفظة (`/captains/me/payout-methods`).
//  ❌ **نسبة القبول** — السيرفر بيرجّعها `null` دايماً (مافيش سجل لردود الكابتن على
//     العروض). شيلنا التايل بتاعها خالص بدل ما نعرض «—» في مكان مهم.
//  ❌ **المستوى/التصنيف** — مالوش وجود في الداتابيز خالص، فمافيش تايل ليه.
//  ❌ **الدعم والتذاكر** — مافيش أي مسار للدعم.
//  ❌ **الإشعارات** — مافيش تفضيلات إشعارات على السيرفر، السويتشات محلية بس.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';
import '../../core/format.dart' as fmt;
import '../../core/router.dart';
import '../../core/theme.dart';
import '../../data/captain_repository.dart';
import '../../models/captain.dart';
import '../../providers/auth_provider.dart';
import '../../providers/captain_status_provider.dart';
import '../../providers/theme_provider.dart';
import '../../widgets/common.dart';

class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key});

  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
  /// تفضيلات الإشعارات — **محلية بالكامل**، مافيش endpoint يحفظها.
  bool _orderAlerts = true;
  bool _promoAlerts = false;

  /// تعديل المركبة — `PATCH /captains/me` (النوع واللوحة بس).
  Future<void> _editVehicle(Captain? captain) async {
    if (captain == null) {
      _snack(context, 'استنى لحد ما بياناتك توصل');
      return;
    }

    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _VehicleSheet(captain: captain),
    );

    if (saved != true || !mounted) return;
    ref.invalidate(captainProvider);
    _snack(context, 'تم تحديث بيانات المركبة');
  }

  Future<void> _confirmLogout() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: QColors.surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(QRadius.xl)),
        title: Text('تسجيل الخروج', style: QText.section),
        content: Text(
          'هل تريد تسجيل الخروج؟ ستحتاج إلى الدخول مرة أخرى برقم الجوال والرمز.',
          style: QText.bodyMuted,
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: Text('رجوع', style: QText.body.copyWith(fontSize: 14)),
          ),
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: Text(
              'خروج',
              style: QText.body.copyWith(fontSize: 14, color: QColors.danger),
            ),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    try {
      await ref.read(authProvider.notifier).logout();
      if (!mounted) return;
      context.go(QRoutes.login);
    } on ApiException catch (e) {
      if (!mounted) return;
      _snack(context, e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final captainAsync = ref.watch(captainProvider);
    final fallbackName = ref.watch(authProvider).fullName;

    return Scaffold(
      backgroundColor: QColors.canvas,
      body: ListView(
        padding: EdgeInsets.zero,
        children: [
          _Hero(captainAsync: captainAsync, fallbackName: fallbackName),
          Padding(
            padding: const EdgeInsets.all(QSpace.screenH),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _StatTrio(captain: captainAsync.valueOrNull),
                const SizedBox(height: 14),
                _Menu(
                  captain: captainAsync.valueOrNull,
                  onUnavailable: (message) => _snack(context, message),
                  onEditVehicle: () => _editVehicle(captainAsync.valueOrNull),
                ),
                const SizedBox(height: 14),
                _NotificationsCard(
                  orderAlerts: _orderAlerts,
                  promoAlerts: _promoAlerts,
                  onOrderAlerts: (value) => setState(() => _orderAlerts = value),
                  onPromoAlerts: (value) => setState(() => _promoAlerts = value),
                ),
                const SizedBox(height: 14),
                QCard(
                  borderColor: QColors.dangerBorder,
                  onTap: _confirmLogout,
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.logout, size: 19, color: QColors.danger),
                      const SizedBox(width: 8),
                      Text(
                        'تسجيل الخروج',
                        style: QText.body.copyWith(fontSize: 15, color: QColors.danger),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 8),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// الهيرو الأسود — الاسم والمركبة والتقييم.
class _Hero extends StatelessWidget {
  const _Hero({required this.captainAsync, required this.fallbackName});

  final AsyncValue<Captain> captainAsync;
  final String fallbackName;

  @override
  Widget build(BuildContext context) {
    final captain = captainAsync.valueOrNull;
    final name = captain?.fullName.trim().isNotEmpty == true
        ? captain!.fullName
        : (fallbackName.trim().isEmpty ? 'كابتن' : fallbackName);
    final initial = name.trim().isEmpty ? '؟' : name.trim().substring(0, 1);

    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: QColors.inkSurface,
        borderRadius: const BorderRadius.vertical(bottom: Radius.circular(28)),
      ),
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(QSpace.screenH, 12, QSpace.screenH, 22),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const QBackButton(onDark: true),
                  const SizedBox(width: 12),
                  Text(
                    'الملف الشخصي',
                    style: QText.screenTitle.copyWith(color: Colors.white, fontSize: 17),
                  ),
                ],
              ),
              const SizedBox(height: 18),
              Row(
                children: [
                  Container(
                    width: 64,
                    height: 64,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(color: QColors.brand, shape: BoxShape.circle),
                    child: Text(
                      initial,
                      style: QText.display.copyWith(fontSize: 26, color: QColors.ink),
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: QText.display.copyWith(fontSize: 18, color: Colors.white),
                        ),
                        const SizedBox(height: 3),
                        // المركبة من `GET /captains/me`؛ لو النداء رمى بنعرض رسالة
                        // السيرفر زي ما هي مش بنخترع بيانات فاضية.
                        captainAsync.when(
                          loading: () => Text(
                            'بنجيب بياناتك…',
                            style: TextStyle(
                              fontFamily: 'Cairo',
                              fontSize: 12.5,
                              fontWeight: FontWeight.w600,
                              color: QColors.darkSub,
                            ),
                          ),
                          error: (error, _) => Text(
                            error is ApiException ? error.message : 'تعذّر تحميل بياناتك',
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontFamily: 'Cairo',
                              fontSize: 11.5,
                              fontWeight: FontWeight.w600,
                              color: QColors.dangerOnDark,
                            ),
                          ),
                          data: (value) => Text(
                            value.vehicleLabel,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontFamily: 'Cairo',
                              fontSize: 12.5,
                              fontWeight: FontWeight.w600,
                              color: QColors.darkSub,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (captain != null) ...[
                    const SizedBox(width: 10),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                      decoration: BoxDecoration(
                        color: QColors.brand,
                        borderRadius: BorderRadius.circular(QRadius.pill),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Text('⭐', style: TextStyle(fontSize: 13)),
                          const SizedBox(width: 5),
                          QLtr(
                            child: Text(
                              fmt.rating(captain.rating),
                              style: QText.num(size: 13.5, weight: FontWeight.w800),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// تلات أرقام — **كلهم حقيقيين** من `GET /captains/me`.
///
/// «نسبة القبول» و«المستوى» كانوا هنا وشيلناهم: الأولى بيرجّعها السيرفر `null`
/// دايماً والتانية مالهاش وجود في الداتابيز — تايل فاضي في مكان بارز أسوأ من
/// إننا نعرض التلاتة اللي عندنا عنهم بيانات فعلية.
class _StatTrio extends StatelessWidget {
  const _StatTrio({required this.captain});

  final Captain? captain;

  @override
  Widget build(BuildContext context) {
    final value = captain;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 16),
      decoration: BoxDecoration(
        color: QColors.inkSoft,
        borderRadius: BorderRadius.circular(QRadius.lg),
      ),
      child: Row(
        children: [
          _Stat(
            value: value?.totalDeliveries == null ? '—' : '${value!.totalDeliveries}',
            label: 'توصيلة',
          ),
          const _Divider(),
          _Stat(
            value: value == null ? '—' : value.documentsLabel,
            label: 'وثائق',
          ),
          const _Divider(),
          _Stat(
            value: value == null ? '—' : value.verificationLabel,
            label: 'الحالة',
            valueColor: value == null ? null : (value.isVerified ? QColors.online : QColors.gold),
          ),
        ],
      ),
    );
  }
}

class _Divider extends StatelessWidget {
  const _Divider();

  @override
  Widget build(BuildContext context) => Container(width: 1, height: 40, color: QColors.inkLine);
}

class _Stat extends StatelessWidget {
  const _Stat({required this.value, required this.label, this.valueColor});

  /// ممكن يكون رقم («٤٢» / «3/5») أو نص («موثّق») — عشان كده QLtr على الأرقام بس.
  final String value;
  final String label;
  final Color? valueColor;

  /// الأرقام بخط Outfit وجوّه QLtr، والنص العربي بـ Cairo من غير عزل —
  /// Outfit مافيهوش حروف عربية والـ bidi بيقلب النص العربي لو اتلف في QLtr.
  bool get _isNumeric => RegExp(r'^[0-9/.\-—]+$').hasMatch(value);

  @override
  Widget build(BuildContext context) {
    final color = valueColor ?? Colors.white;

    final text = Text(
      value,
      textAlign: TextAlign.center,
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
      style: _isNumeric
          ? QText.num(size: 19, weight: FontWeight.w800, color: color)
          : TextStyle(
              fontFamily: 'Cairo',
              fontSize: 15,
              fontWeight: FontWeight.w800,
              color: color,
            ),
    );

    return Expanded(
      child: Column(
        children: [
          _isNumeric ? QLtr(child: text) : text,
          const SizedBox(height: 3),
          Text(
            label,
            textAlign: TextAlign.center,
            style: TextStyle(
              fontFamily: 'Cairo',
              fontSize: 11.5,
              fontWeight: FontWeight.w700,
              color: QColors.darkSub,
            ),
          ),
        ],
      ),
    );
  }
}

/// `ConsumerWidget` مش `StatelessWidget`: صف «المظهر» محتاج يقرا الوضع الحالي
/// من الـ provider ويعرضه جنب العنوان.
class _Menu extends ConsumerWidget {
  const _Menu({required this.onUnavailable, required this.onEditVehicle, this.captain});

  final ValueChanged<String> onUnavailable;
  final VoidCallback onEditVehicle;
  final Captain? captain;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return QTileGroup(
      children: [
        QListTile(
          emoji: '🪪',
          title: 'وثائقي',
          subtitle: captain == null ? null : '${captain!.documentsLabel} مقبولة',
          onTap: () => context.push(QRoutes.documents),
        ),
        QListTile(
          emoji: '🛵',
          title: 'تعديل المركبة',
          subtitle: captain?.vehicleLabel,
          onTap: onEditVehicle,
        ),
        QListTile(
          emoji: '🏦',
          title: 'الحسابات البنكية',
          subtitle: 'إدارة حسابات الاستلام والسحب',
          onTap: () => context.push(QRoutes.wallet),
        ),
        QListTile(
          emoji: '🌓',
          title: 'المظهر',
          onTap: () => _pickTheme(context, ref),
          trailing: Text(
            ThemeModeNotifier.labelOf(ref.watch(themeModeProvider)),
            style: QText.tiny.copyWith(color: QColors.textMuted),
          ),
        ),
        QListTile(emoji: '🗓', title: 'الورديات', onTap: () => context.push(QRoutes.shift)),
        QListTile(emoji: '💰', title: 'الأرباح', onTap: () => context.push(QRoutes.earnings)),
        QListTile(emoji: '🧾', title: 'سجل الطلبات', onTap: () => context.push(QRoutes.trips)),
        QListTile(
          emoji: '🎧',
          title: 'دعم الكباتن',
          subtitle: 'لا يوجد مسار للدعم ولا للتذاكر',
          onTap: () => onUnavailable('الدعم محتاج API'),
        ),
      ],
    );
  }
}

/// شيت تعديل المركبة — بيرجّع `true` لو الحفظ نجح.
///
/// السيرفر بيقبل `vehicleType` و `plateNumber` و `avatarUrl` بس؛ أي حاجة تانية
/// (الاسم، الجوال، الهوية) مش قابلة للتعديل من التطبيق خالص.
class _VehicleSheet extends ConsumerStatefulWidget {
  const _VehicleSheet({required this.captain});

  final Captain captain;

  @override
  ConsumerState<_VehicleSheet> createState() => _VehicleSheetState();
}

class _VehicleSheetState extends ConsumerState<_VehicleSheet> {
  late final _plate = TextEditingController(text: widget.captain.plateNumber ?? '');
  late String _vehicleType = widget.captain.vehicleType ?? Captain.vehicleTypes.first;

  bool _saving = false;

  @override
  void dispose() {
    _plate.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() => _saving = true);

    try {
      await ref.read(captainRepositoryProvider).updateProfile(
            vehicleType: _vehicleType,
            plateNumber: _plate.text.trim(),
          );
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _saving = false);
      _snack(context, e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(QSpace.screenH, 18, QSpace.screenH, 18),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('تعديل المركبة', style: QText.section),
              const SizedBox(height: 14),
              Text('نوع المركبة', style: QText.fieldLabel),
              const SizedBox(height: 8),
              Row(
                children: [
                  for (final type in Captain.vehicleTypes) ...[
                    QChip(
                      label: Captain.vehicleTypeLabelOf(type),
                      selected: _vehicleType == type,
                      onTap: () => setState(() => _vehicleType = type),
                    ),
                    const SizedBox(width: 8),
                  ],
                ],
              ),
              const SizedBox(height: 14),
              QField(
                label: 'رقم اللوحة',
                hint: 'ط ح ب ٤٢٨١',
                controller: _plate,
                onChanged: (_) => setState(() {}),
              ),
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                child: QButton(
                  label: 'حفظ',
                  // السيرفر بيرفض لوحة فاضية — بنمنع الإرسال بدل ما ناكل 400.
                  enabled: _plate.text.trim().isNotEmpty,
                  loading: _saving,
                  onPressed: _save,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// إعدادات الإشعارات — سويتشات محلية، مافيش تفضيلات على السيرفر.
class _NotificationsCard extends StatelessWidget {
  const _NotificationsCard({
    required this.orderAlerts,
    required this.promoAlerts,
    required this.onOrderAlerts,
    required this.onPromoAlerts,
  });

  final bool orderAlerts;
  final bool promoAlerts;
  final ValueChanged<bool> onOrderAlerts;
  final ValueChanged<bool> onPromoAlerts;

  @override
  Widget build(BuildContext context) {
    return QCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text('⚙︎ الإعدادات', style: QText.section.copyWith(fontSize: 14)),
              const SizedBox(width: 8),
              Text(
                '(محلي)',
                style: QText.tiny.copyWith(color: QColors.faint, fontWeight: FontWeight.w600),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            'لا يوجد endpoint لتفضيلات الإشعارات — هذه الاختيارات لا تُحفظ على الخادم',
            style: QText.tiny.copyWith(color: QColors.faint, fontWeight: FontWeight.w600),
          ),
          Divider(color: QColors.line, height: 20),
          Row(
            children: [
              Expanded(
                child: Text('تنبيه الطلبات الجديدة', style: QText.body.copyWith(fontSize: 14)),
              ),
              QSwitch(value: orderAlerts, onChanged: onOrderAlerts),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: Text('عروض وإشعارات تسويقية', style: QText.body.copyWith(fontSize: 14)),
              ),
              QSwitch(value: promoAlerts, onChanged: onPromoAlerts),
            ],
          ),
        ],
      ),
    );
  }
}

void _snack(BuildContext context, String message) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(
        backgroundColor: QColors.inkSurface,
        content: Text(
          message,
          style: QText.body.copyWith(fontSize: 14, color: QColors.brand),
        ),
      ),
    );
}

/// منتقي المظهر — فاتح / داكن / حسب النظام.
///
/// شيت بدل شاشة كاملة: تلات خيارات بس، والتغيير بيبان فوراً وراء الشيت فالمستخدم
/// يشوف النتيجة قبل ما يقفل.
Future<void> _pickTheme(BuildContext context, WidgetRef ref) async {
  await showModalBottomSheet<void>(
    context: context,
    backgroundColor: QColors.surface,
    builder: (_) => SafeArea(
      child: Consumer(
        builder: (_, sheetRef, __) {
          final current = sheetRef.watch(themeModeProvider);
          return Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(height: 14),
              Text(
                'المظهر',
                style: TextStyle(
                  fontFamily: 'Cairo',
                  fontSize: 16,
                  fontWeight: FontWeight.w900,
                  color: QColors.ink,
                ),
              ),
              const SizedBox(height: 10),
              for (final mode in ThemeMode.values)
                QListTile(
                  title: ThemeModeNotifier.labelOf(mode),
                  emoji: switch (mode) {
                    ThemeMode.light => '☀️',
                    ThemeMode.dark => '🌙',
                    ThemeMode.system => '📱',
                  },
                  showChevron: false,
                  trailing: current == mode
                      ? Icon(Icons.check_rounded, size: 20, color: QColors.brand)
                      : null,
                  onTap: () => sheetRef.read(themeModeProvider.notifier).select(mode),
                ),
              const SizedBox(height: 10),
            ],
          );
        },
      ),
    ),
  );
}
