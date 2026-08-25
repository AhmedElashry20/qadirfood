// شاشة ١٣: الإعدادات والفروع — كارت الفرع الحالي + مجموعة الإدارة + تسجيل الخروج.
// جوّه الشل السفلي، فمافيش زر رجوع في الهيدر.
//
// الصفوف اللي لسه مالهاش endpoint (بيانات المطعم، الطابعة، الدعم) بتعرض «قريباً»
// بدل ما تدّعي نجاح — مافيش تزوير حالة هنا.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';
import '../../core/router.dart';
import '../../core/theme.dart';
import '../../data/merchant_repository.dart';
import '../../models/branch.dart';
import '../../providers/branch_status_provider.dart';
import '../../widgets/common.dart';

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  void _snack(BuildContext context, String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        backgroundColor: QColors.ink,
        content: Text(message, style: QText.body.copyWith(color: QColors.brand, fontSize: 14)),
      ),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final branch = ref.watch(branchProvider);
    final users = ref.watch(branchUsersProvider);
    final alertSound = ref.watch(alertSoundEnabledProvider);

    return Scaffold(
      backgroundColor: QColors.canvas,
      appBar: const QHeader(showBack: false, title: 'الإعدادات'),
      body: RefreshIndicator(
        color: QColors.brand,
        onRefresh: () async {
          await ref.read(branchProvider.notifier).refresh();
          ref.invalidate(branchUsersProvider);
        },
        child: ListView(
          padding: const EdgeInsets.fromLTRB(QSpace.screenH, 16, QSpace.screenH, 28),
          children: [
            const _SectionLabel('الفرع'),
            const SizedBox(height: 8),
            branch.when(
              loading: () => const Padding(
                padding: EdgeInsets.symmetric(vertical: 28),
                child: QLoading(),
              ),
              error: (error, _) => QErrorView(
                message: error is ApiException ? error.message : 'تعذّر تحميل بيانات الفرع',
                onRetry: () => ref.read(branchProvider.notifier).refresh(),
              ),
              data: (value) => _BranchCard(branch: value),
            ),
            const SizedBox(height: 22),
            const _SectionLabel('إدارة'),
            const SizedBox(height: 8),
            QTileGroup(
              children: [
                QListTile(
                  emoji: '🏷',
                  title: 'بيانات المطعم',
                  subtitle: 'اللوجو والوصف والتواصل',
                  onTap: () => _snack(context, 'قريباً'),
                ),
                QListTile(
                  emoji: '🕐',
                  title: 'أوقات العمل',
                  onTap: () => context.push(QRoutes.workingHours),
                ),
                QListTile(
                  emoji: '🔓',
                  title: 'حالة الفرع',
                  onTap: () => context.push(QRoutes.branchStatus),
                ),
                QListTile(
                  emoji: '👥',
                  title: 'مستخدمو الفرع',
                  // العدد بييجي async — «—» لحد ما يوصل أو لو النداء فشل.
                  trailing: Padding(
                    padding: const EdgeInsets.only(left: 6),
                    child: users.when(
                      loading: () => Text('—', style: QText.num(size: 14, color: QColors.faint)),
                      error: (_, __) => Text('—', style: QText.num(size: 14, color: QColors.faint)),
                      data: (list) => Text(
                        '${list.length}',
                        style: QText.num(size: 14, color: QColors.label),
                      ),
                    ),
                  ),
                  onTap: () => _showUsers(context, ref),
                ),
                QListTile(
                  emoji: '🧾',
                  title: 'سجل الطلبات',
                  onTap: () => context.push(QRoutes.history),
                ),
                QListTile(
                  emoji: '🖨',
                  title: 'طابعة الفواتير',
                  // مافيش ربط طابعة في الـ API ولا في التطبيق لسه.
                  trailing: Padding(
                    padding: const EdgeInsets.only(left: 6),
                    child: Text(
                      'غير متصلة',
                      style: QText.tiny.copyWith(color: QColors.faint),
                    ),
                  ),
                  onTap: () => _snack(context, 'ربط الطابعة قريباً'),
                ),
                QListTile(
                  emoji: '🔔',
                  title: 'صوت التنبيهات',
                  subtitle: 'جرس الطلبات الواردة',
                  showChevron: false,
                  trailing: QSwitch(
                    value: alertSound,
                    onChanged: (value) =>
                        ref.read(alertSoundEnabledProvider.notifier).setEnabled(value),
                  ),
                  onTap: () => ref.read(alertSoundEnabledProvider.notifier).toggle(),
                ),
                QListTile(
                  emoji: '🎧',
                  title: 'دعم الشركاء',
                  onTap: () => _snack(context, 'قريباً'),
                ),
              ],
            ),
            const SizedBox(height: 22),
            _LogoutCard(onTap: () => _confirmLogout(context, ref)),
          ],
        ),
      ),
    );
  }

  /// قائمة عرض بس — إضافة/تعديل المستخدمين مالهاش endpoint في تطبيق المطعم.
  Future<void> _showUsers(BuildContext context, WidgetRef ref) async {
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: QColors.surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(QRadius.xl)),
        title: const Text('مستخدمو الفرع', style: QText.section),
        content: SizedBox(
          width: 320,
          // Consumer عشان الحوار يتحدّث لوحده لما النداء يخلص.
          child: Consumer(
            builder: (_, dialogRef, __) => dialogRef.watch(branchUsersProvider).when(
                  loading: () => const SizedBox(height: 90, child: QLoading()),
                  error: (error, _) => Text(
                    error is ApiException ? error.message : 'تعذّر تحميل المستخدمين',
                    style: QText.bodyMuted,
                  ),
                  data: (list) => list.isEmpty
                      ? const Text('مافيش مستخدمين على الفرع', style: QText.bodyMuted)
                      : Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            for (final user in list)
                              Padding(
                                padding: const EdgeInsets.symmetric(vertical: 7),
                                child: Row(
                                  children: [
                                    Expanded(
                                      child: Text(
                                        user.fullName,
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: QText.body.copyWith(fontSize: 14),
                                      ),
                                    ),
                                    const SizedBox(width: 8),
                                    QBadge(label: user.roleAr),
                                  ],
                                ),
                              ),
                          ],
                        ),
                ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: Text('تمام', style: QText.body.copyWith(color: QColors.goldDeep)),
          ),
        ],
      ),
    );
  }

  Future<void> _confirmLogout(BuildContext context, WidgetRef ref) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: QColors.surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(QRadius.xl)),
        title: const Text('تسجيل الخروج؟', style: QText.section),
        content: const Text(
          'هتحتاج تدخل بالإيميل أو رقم الموبايل تاني عشان تستقبل طلبات.',
          style: QText.bodyMuted,
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: Text('رجوع', style: QText.body.copyWith(color: QColors.label)),
          ),
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: Text('خروج', style: QText.body.copyWith(color: QColors.danger)),
          ),
        ],
      ),
    );

    if (confirmed != true || !context.mounted) return;

    try {
      // auth_provider لسه ماتكتبش، فبننادي الريبو مباشرة — لو اتضاف
      // authProvider.notifier.logout() لاحقاً يبقى ده هو المكان اللي يتبدّل.
      await ref.read(authRepositoryProvider).logout();
      if (!context.mounted) return;
      context.go(QRoutes.login);
    } on ApiException catch (e) {
      if (!context.mounted) return;
      _snack(context, e.message);
    }
  }
}

// ─────────────────────────── أجزاء الشاشة ───────────────────────────

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Text(
        text,
        style: const TextStyle(
          fontFamily: 'Cairo',
          fontSize: 12,
          fontWeight: FontWeight.w800,
          color: QColors.faint,
        ),
      );
}

class _BranchCard extends StatelessWidget {
  const _BranchCard({required this.branch});

  final Branch branch;

  @override
  Widget build(BuildContext context) {
    return QCard(
      highlighted: true,
      onTap: () => context.push(QRoutes.branchStatus),
      padding: const EdgeInsets.all(14),
      child: Row(
        children: [
          Container(
            width: 36,
            height: 36,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: QColors.tintStrong,
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Text('🏬', style: TextStyle(fontSize: 18)),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Flexible(
                      child: Text(
                        branch.nameAr,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontFamily: 'Cairo',
                          fontSize: 15,
                          fontWeight: FontWeight.w800,
                          color: QColors.ink,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    QBadge(
                      label: '● ${branch.status.ar}',
                      color: QColors.chip,
                      textColor: branch.status.color,
                    ),
                  ],
                ),
                const SizedBox(height: 3),
                Text(
                  '${branch.restaurantNameAr} · ${branch.city}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: QText.tiny.copyWith(fontWeight: FontWeight.w600),
                ),
              ],
            ),
          ),
          const Icon(Icons.chevron_right, size: 20, color: QColors.hint),
        ],
      ),
    );
  }
}

class _LogoutCard extends StatelessWidget {
  const _LogoutCard({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: QColors.surface,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          height: QSpace.tapTarget,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
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
    );
  }
}
