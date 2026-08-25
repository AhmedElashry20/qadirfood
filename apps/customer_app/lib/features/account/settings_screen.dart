// شاشة ٢٨: الإعدادات — «البيانات الشخصية» بتعدّل الملف الحقيقي (PATCH /customer/me).
// سويتشات الإشعارات محلية بس: مافيش API لتفضيلات الإشعارات لسه.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';
import '../../core/locale.dart';
import '../../core/router.dart';
import '../../core/theme.dart';
import '../../providers/auth_provider.dart';
import '../../widgets/common.dart';

class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key});

  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
  bool _orderStatus = true;
  bool _offers = true;
  bool _marketing = false;

  void _snack(String message) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(message, style: QText.body.copyWith(color: QColors.brand)),
          behavior: SnackBarBehavior.floating,
          backgroundColor: QColors.ink,
          duration: const Duration(seconds: 2),
        ),
      );
  }

  void _soon() => _snack('قريباً');

  Future<void> _logout() async {
    try {
      await ref.read(authProvider.notifier).logout();
      if (!mounted) return;
      context.go(QRoutes.login);
    } on ApiException catch (e) {
      if (!mounted) return;
      _snack(e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: QColors.canvas,
      appBar: const QHeader(title: 'الإعدادات'),
      body: ListView(
        padding: const EdgeInsets.all(QSpace.screenH),
        children: [
          const _SectionLabel('الحساب'),
          const SizedBox(height: 8),
          QTileGroup(
            children: [
              QListTile(
                title: 'البيانات الشخصية',
                emoji: '👤',
                onTap: () => context.push(QRoutes.completeProfile),
              ),
              QListTile(
                title: 'اللغة',
                emoji: '🌐',
                onTap: () => context.push(QRoutes.language),
                trailing: Text(
                  '${ref.watch(languageProvider).flag} ${ref.watch(languageProvider).arabicName}',
                  style: const TextStyle(
                    fontFamily: 'Cairo',
                    fontSize: 12.5,
                    fontWeight: FontWeight.w700,
                    color: QColors.textMuted,
                  ),
                ),
              ),
              QListTile(
                title: 'تغيير رقم الجوال',
                emoji: '📱',
                onTap: () => context.push(QRoutes.login),
              ),
            ],
          ),
          const SizedBox(height: 14),
          // التفضيلات دي محفوظة في الشاشة بس — مافيش endpoint لها.
          const _SectionLabel('الإشعارات', note: '(محلي — هيتربط بـ Firebase)'),
          const SizedBox(height: 8),
          QTileGroup(
            children: [
              _SwitchRow(
                title: 'حالة الطلب',
                value: _orderStatus,
                onChanged: (v) => setState(() => _orderStatus = v),
              ),
              _SwitchRow(
                title: 'العروض والكوبونات',
                value: _offers,
                onChanged: (v) => setState(() => _offers = v),
              ),
              _SwitchRow(
                title: 'رسائل تسويقية',
                value: _marketing,
                onChanged: (v) => setState(() => _marketing = v),
              ),
            ],
          ),
          const SizedBox(height: 14),
          const _SectionLabel('عام'),
          const SizedBox(height: 8),
          QTileGroup(
            children: [
              QListTile(title: 'الشروط والأحكام', emoji: '📄', onTap: _soon),
              QListTile(title: 'سياسة الخصوصية', emoji: '🛡', onTap: _soon),
              QListTile(
                title: 'عن التطبيق',
                emoji: 'ℹ️',
                showChevron: false,
                trailing: Text('v2.4.1', style: QText.num(size: 12, color: QColors.hint)),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Material(
            color: QColors.surface,
            borderRadius: BorderRadius.circular(QRadius.lg),
            child: InkWell(
              onTap: _logout,
              borderRadius: BorderRadius.circular(QRadius.lg),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(QRadius.lg),
                  border: Border.all(color: QColors.dangerBorder, width: 1.5),
                ),
                child: const Text(
                  'تسجيل الخروج',
                  style: TextStyle(
                    fontFamily: 'Cairo',
                    fontSize: 14,
                    fontWeight: FontWeight.w800,
                    color: QColors.danger,
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.text, {this.note});

  final String text;

  /// ملاحظة صغيرة جنب العنوان («محلي — هيتربط بـ Firebase»).
  final String? note;

  @override
  Widget build(BuildContext context) {
    const style = TextStyle(
      fontFamily: 'Cairo',
      fontSize: 12,
      fontWeight: FontWeight.w800,
      color: QColors.faint,
    );

    if (note == null) return Text(text, style: style);

    return Text.rich(
      TextSpan(
        text: text,
        children: [
          TextSpan(
            text: '  $note',
            style: style.copyWith(fontWeight: FontWeight.w600),
          ),
        ],
      ),
      style: style,
    );
  }
}

class _SwitchRow extends StatelessWidget {
  const _SwitchRow({required this.title, required this.value, required this.onChanged});

  final String title;
  final bool value;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      child: Row(
        children: [
          Text(
            title,
            style: const TextStyle(
              fontFamily: 'Cairo',
              fontSize: 13.5,
              fontWeight: FontWeight.w700,
              color: QColors.ink,
            ),
          ),
          const Spacer(),
          QSwitch(value: value, onChanged: onChanged),
        ],
      ),
    );
  }
}
