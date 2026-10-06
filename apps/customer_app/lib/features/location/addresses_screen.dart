// شاشة ٨: قائمة عناويني — من الـ API (GET /customer/addresses)
// الحذف/التعيين كافتراضي نداءات حقيقية: بتفشل → بنعرض رسالة السيرفر زي ما هي.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';
import '../../core/router.dart';
import '../../core/theme.dart';
import '../../models/address.dart';
import '../../providers/location_provider.dart';
import '../../widgets/common.dart';
import 'address_editor_screen.dart';

class AddressesScreen extends ConsumerWidget {
  const AddressesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final addresses = ref.watch(addressesProvider);

    return Scaffold(
      backgroundColor: QColors.canvas,
      appBar: const QHeader(title: 'عناويني'),
      body: addresses.when(
        loading: () => Center(child: CircularProgressIndicator(color: QColors.ink)),
        error: (error, _) => _ErrorState(
          message: error is ApiException ? error.message : 'تعذّر تحميل عناوينك',
          onRetry: () => ref.invalidate(addressesProvider),
        ),
        data: (list) {
          if (list.isEmpty) {
            return const Padding(
              padding: EdgeInsets.all(QSpace.screenH),
              child: QEmpty(message: 'لا توجد عناوين — أضف عنوانك الأول', emoji: '📍'),
            );
          }

          return ListView.separated(
            padding: const EdgeInsets.all(QSpace.screenH),
            itemCount: list.length,
            separatorBuilder: (_, __) => const SizedBox(height: QSpace.gap),
            itemBuilder: (context, i) => _AddressCard(
              address: list[i],
              // لازم يفضل عنوان واحد على الأقل للتوصيل.
              canDelete: list.length > 1,
            ),
          );
        },
      ),
      bottomNavigationBar: QBottomBar(
        child: QButton(
          label: '+ إضافة عنوان جديد',
          onPressed: () => context.push(QRoutes.pickLocation),
        ),
      ),
    );
  }
}

class _AddressCard extends ConsumerWidget {
  const _AddressCard({required this.address, required this.canDelete});

  final Address address;
  final bool canDelete;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final a = address;
    // الإطار الأصفر = العنوان المختار للتوصيل (اللي إتمام الطلب بيقراه)،
    // مش الافتراضي — دول مفهومين مختلفين.
    final selectedId = ref.watch(selectedAddressIdProvider);

    return QCard(
      selected: a.id == selectedId,
      padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 16),
      onTap: () {
        // اختيار العنوان للتوصيل — ولو الشاشة اتفتحت من إتمام الطلب نرجع بيه.
        ref.read(selectedAddressIdProvider.notifier).select(a.id);
        if (context.canPop()) context.pop();
      },
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: a.isDefault ? QColors.tintStrong : QColors.chip,
              borderRadius: BorderRadius.circular(QRadius.md),
            ),
            child: Text(a.label.emoji, style: const TextStyle(fontSize: 20)),
          ),
          const SizedBox(width: QSpace.gap),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Flexible(
                      child: Text(
                        a.title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontFamily: 'Cairo',
                          fontSize: 15,
                          fontWeight: FontWeight.w800,
                          color: QColors.ink,
                        ),
                      ),
                    ),
                    if (a.isDefault) ...[
                      const SizedBox(width: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(vertical: 2, horizontal: 8),
                        decoration: BoxDecoration(
                          color: QColors.brand,
                          borderRadius: BorderRadius.circular(QRadius.pill),
                        ),
                        child: Text(
                          'الافتراضي',
                          style: TextStyle(
                            fontFamily: 'Cairo',
                            fontSize: 10.5,
                            fontWeight: FontWeight.w800,
                            color: QColors.ink,
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 3),
                Text(
                  a.details,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontFamily: 'Cairo',
                    fontSize: 12.5,
                    fontWeight: FontWeight.w600,
                    color: QColors.textMuted,
                  ),
                ),
              ],
            ),
          ),
          PopupMenuButton<_AddressAction>(
            icon: Icon(Icons.more_vert, color: QColors.hint),
            color: QColors.surface,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(QRadius.md),
            ),
            onSelected: (action) {
              final notifier = ref.read(addressesProvider.notifier);
              switch (action) {
                case _AddressAction.makeDefault:
                  _run(context, () => notifier.makeDefault(a.id));
                case _AddressAction.edit:
                  context.push(
                    QRoutes.addressEditor,
                    extra: AddressEditorArgs(addressId: a.id, lat: a.lat, lng: a.lng),
                  );
                case _AddressAction.remove:
                  _run(context, () => notifier.remove(a.id));
              }
            },
            itemBuilder: (_) => [
              PopupMenuItem(
                value: _AddressAction.makeDefault,
                child: Text(
                  'تعيين كافتراضي',
                  style: TextStyle(
                    fontFamily: 'Cairo',
                    fontSize: 13.5,
                    fontWeight: FontWeight.w700,
                    color: QColors.ink,
                  ),
                ),
              ),
              PopupMenuItem(
                value: _AddressAction.edit,
                child: Text(
                  'تعديل',
                  style: TextStyle(
                    fontFamily: 'Cairo',
                    fontSize: 13.5,
                    fontWeight: FontWeight.w700,
                    color: QColors.ink,
                  ),
                ),
              ),
              if (canDelete)
                PopupMenuItem(
                  value: _AddressAction.remove,
                  child: Text(
                    'حذف',
                    style: TextStyle(
                      fontFamily: 'Cairo',
                      fontSize: 13.5,
                      fontWeight: FontWeight.w700,
                      color: QColors.danger,
                    ),
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }

  /// أي نداء شبكة على العنوان — الخطأ بيظهر برسالة السيرفر، مافيش فشل صامت.
  Future<void> _run(BuildContext context, Future<void> Function() action) async {
    try {
      await action();
    } on ApiException catch (e) {
      if (!context.mounted) return;
      _showError(context, e.message);
    } catch (_) {
      if (!context.mounted) return;
      _showError(context, 'تعذّر إكمال العملية — حاول مرة أخرى');
    }
  }
}

/// رسالة خطأ من السيرفر — خلفية سودا ونص أصفر.
void _showError(BuildContext context, String message) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(
        content: Text(
          message,
          style: TextStyle(
            fontFamily: 'Cairo',
            fontSize: 13.5,
            fontWeight: FontWeight.w800,
            color: QColors.brand,
          ),
        ),
        behavior: SnackBarBehavior.floating,
        backgroundColor: QColors.inkSurface,
        duration: const Duration(seconds: 3),
      ),
    );
}

/// فشل تحميل القائمة (شبكة) — مع إعادة محاولة.
class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(QSpace.screenH),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            message,
            textAlign: TextAlign.center,
            style: TextStyle(
              fontFamily: 'Cairo',
              fontSize: 14,
              fontWeight: FontWeight.w700,
              color: QColors.ink,
              height: 1.6,
            ),
          ),
          const SizedBox(height: QSpace.gapLg),
          QButton(style: QButtonStyle.outline, label: 'إعادة المحاولة', onPressed: onRetry),
        ],
      ),
    );
  }
}

enum _AddressAction { makeDefault, edit, remove }
