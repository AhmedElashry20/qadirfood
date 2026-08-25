// شاشات التوصيل بالتناوب (الحرم) — قلب فكرة التطبيق:
//  • مندوب المركبة: يوصّل لبوابة الحرم، يصوّر، ويسلّم لمندوب المشي بكود.
//  • مندوب المشي: يستلم بالكود + صورة، وبعدها يكمّل للعميل ويسلّم بكود + صورة.
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';

import '../../core/api_client.dart';
import '../../core/format.dart' as fmt;
import '../../core/router.dart';
import '../../core/theme.dart';
import '../../data/captain_repository.dart';
import '../../providers/active_trip_provider.dart';
import '../../widgets/common.dart';

void _snack(BuildContext c, String m) =>
    ScaffoldMessenger.of(c).showSnackBar(SnackBar(content: Text(m)));

/// كاميرا → رفع → رابط.
Future<String?> _capture(WidgetRef ref, BuildContext ctx, {String folder = 'handoffs'}) async {
  XFile? picked;
  try {
    picked = await ImagePicker().pickImage(source: ImageSource.camera, maxWidth: 1400, imageQuality: 80);
  } catch (_) {
    if (ctx.mounted) _snack(ctx, 'مش قادرين نفتح الكاميرا');
    return null;
  }
  if (picked == null) return null;
  try {
    return await ref.read(captainRepositoryProvider).uploadFile(File(picked.path), folder: folder);
  } on ApiException catch (e) {
    if (ctx.mounted) _snack(ctx, e.message);
    return null;
  }
}

// ════════════ مندوب المركبة: التسليم عند بوابة الحرم ════════════
class RelayHandoffScreen extends ConsumerStatefulWidget {
  const RelayHandoffScreen({super.key, required this.orderId});
  final String orderId;
  @override
  ConsumerState<RelayHandoffScreen> createState() => _RelayHandoffScreenState();
}

class _RelayHandoffScreenState extends ConsumerState<RelayHandoffScreen> {
  bool _busy = false;
  Map<String, dynamic>? _result; // نتيجة arrive: مندوب المشي + نقطة الالتقاء

  Future<void> _arrive() async {
    setState(() => _busy = true);
    try {
      final photo = await _capture(ref, context);
      if (photo == null) {
        if (mounted) setState(() => _busy = false);
        return;
      }
      final res = await ref.read(activeTripProvider.notifier).relayArrive(widget.orderId, photoUrl: photo);
      if (mounted) setState(() => _result = res);
    } on ApiException catch (e) {
      if (mounted) _snack(context, e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final tripAsync = ref.watch(tripProvider(widget.orderId));
    return tripAsync.when(
      loading: () => const Scaffold(backgroundColor: QColors.canvas, body: QLoading()),
      error: (e, _) => Scaffold(
        backgroundColor: QColors.canvas,
        appBar: const QHeader(title: 'التسليم عند الحرم'),
        body: QErrorView(message: e is ApiException ? e.message : 'خطأ', onRetry: () => ref.invalidate(tripProvider(widget.orderId))),
      ),
      data: (trip) {
        final foot = _result?['footCourier'] as Map<String, dynamic>?;
        return Scaffold(
          backgroundColor: QColors.canvas,
          appBar: QHeader(title: 'التسليم عند بوابة الحرم', subtitle: Text('طلب ${fmt.ltr(trip.number)}', style: QText.tiny)),
          body: ListView(
            padding: const EdgeInsets.all(QSpace.screenH),
            children: [
              QCard(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('🕋 وجهة الطلب داخل الحرم', style: QText.body.copyWith(fontWeight: FontWeight.w800)),
                  const SizedBox(height: 6),
                  Text('المركبات ممنوعة جوّه. وصّل لأقرب بوابة وسلّم الطلب لمندوب المشي.',
                      style: QText.tiny.copyWith(color: QColors.label)),
                ]),
              ),
              const SizedBox(height: 14),
              // كود التسليم لمندوب المشي.
              QCard(
                child: Column(children: [
                  Text('كود التسليم لمندوب المشي', style: QText.tiny.copyWith(color: QColors.label)),
                  const SizedBox(height: 8),
                  Text(fmt.ltr(trip.handoffCode ?? '----'),
                      style: QText.display.copyWith(letterSpacing: 10, fontWeight: FontWeight.w900, color: QColors.brandDeep)),
                  const SizedBox(height: 6),
                  Text('قوله لمندوب المشي عشان يدخّله ويأكّد الاستلام', style: QText.tiny.copyWith(color: QColors.label)),
                ]),
              ),
              const SizedBox(height: 14),
              if (foot != null)
                QCard(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('✓ اتسند مندوب مشي', style: QText.body.copyWith(fontWeight: FontWeight.w800, color: QColors.success)),
                    const SizedBox(height: 6),
                    Text('${foot['name']} · ${foot['phone'] ?? ''}', style: QText.body),
                    const SizedBox(height: 6),
                    Text('استنى تأكيده بالكود، وبعدها رحلتك تخلص وترجع متاح.', style: QText.tiny.copyWith(color: QColors.label)),
                  ]),
                ),
            ],
          ),
          bottomNavigationBar: _result == null
              ? QBottomBar(
                  child: SizedBox(
                    width: double.infinity,
                    child: QButton(
                      label: _busy ? 'جاري…' : 'وصلت البوابة — صوّر وسلّم',
                      onPressed: _busy ? null : _arrive,
                    ),
                  ),
                )
              : QBottomBar(
                  child: SizedBox(
                    width: double.infinity,
                    child: QButton(label: 'تمام', onPressed: () => context.go(QRoutes.home)),
                  ),
                ),
        );
      },
    );
  }
}

// ════════════ مندوب المشي: استلام بالكود + صورة ════════════
final relayIncomingProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>(
  (ref) => ref.watch(tripsRepositoryProvider).relayIncoming(),
);

class RelayIncomingScreen extends ConsumerWidget {
  const RelayIncomingScreen({super.key});

  Future<void> _confirm(BuildContext context, WidgetRef ref, Map<String, dynamic> h) async {
    final codeCtrl = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        backgroundColor: QColors.surface,
        title: Text('استلام الطلب ${fmt.ltr('${h['orderNumber'] ?? ''}')}', style: QText.body),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          Text('اطلب الكود من مندوب المركبة وأدخله:', style: QText.tiny.copyWith(color: QColors.label)),
          const SizedBox(height: 10),
          TextField(
            controller: codeCtrl,
            keyboardType: TextInputType.number,
            textAlign: TextAlign.center,
            style: QText.display.copyWith(letterSpacing: 8),
            decoration: const InputDecoration(hintText: '••••', counterText: ''),
            maxLength: 6,
          ),
        ]),
        actions: [
          TextButton(onPressed: () => c.pop(false), child: const Text('إلغاء')),
          TextButton(onPressed: () => c.pop(true), child: const Text('التالي: صوّر')),
        ],
      ),
    );
    if (ok != true || !context.mounted) return;
    final code = codeCtrl.text.trim();
    if (code.isEmpty) return;
    final photo = await _capture(ref, context, folder: 'handoffs');
    if (photo == null || !context.mounted) return;
    try {
      await ref.read(tripsRepositoryProvider).relayConfirm(h['orderId'] as String, code, photo);
      ref.invalidate(relayIncomingProvider);
      ref.invalidate(activeTripProvider);
      if (context.mounted) {
        _snack(context, 'استلمت الطلب — كمّل التوصيل للعميل داخل الحرم');
        context.go(QRoutes.tripToCustomer(h['orderId'] as String));
      }
    } on ApiException catch (e) {
      if (context.mounted) _snack(context, e.message);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(relayIncomingProvider);
    return Scaffold(
      backgroundColor: QColors.canvas,
      appBar: const QHeader(title: 'استلامات الحرم (مندوب مشي)'),
      body: async.when(
        loading: () => const QLoading(),
        error: (e, _) => QErrorView(message: e is ApiException ? e.message : 'خطأ', onRetry: () => ref.invalidate(relayIncomingProvider)),
        data: (list) => list.isEmpty
            ? const _EmptyRelay()
            : ListView.separated(
                padding: const EdgeInsets.all(QSpace.screenH),
                itemCount: list.length,
                separatorBuilder: (_, __) => const SizedBox(height: 12),
                itemBuilder: (_, i) {
                  final h = list[i];
                  return QCard(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text('طلب ${fmt.ltr('${h['orderNumber'] ?? ''}')}', style: QText.body.copyWith(fontWeight: FontWeight.w800)),
                      const SizedBox(height: 4),
                      Text('الوجهة: ${h['district'] ?? 'داخل الحرم'}', style: QText.tiny.copyWith(color: QColors.label)),
                      const SizedBox(height: 12),
                      SizedBox(
                        width: double.infinity,
                        child: QButton(label: 'استلمت — أدخل الكود وصوّر', onPressed: () => _confirm(context, ref, h)),
                      ),
                    ]),
                  );
                },
              ),
      ),
    );
  }
}

class _EmptyRelay extends StatelessWidget {
  const _EmptyRelay();
  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(40),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const Text('🕋', style: TextStyle(fontSize: 48)),
            const SizedBox(height: 12),
            Text('لا توجد استلامات حالياً', style: QText.body.copyWith(fontWeight: FontWeight.w800)),
            const SizedBox(height: 6),
            Text('أول ما مندوب مركبة يوصل البوابة بطلب لك، هيظهر هنا.',
                textAlign: TextAlign.center, style: QText.tiny.copyWith(color: QColors.label)),
          ]),
        ),
      );
}
