// شاشة الدفع الإلكتروني — بتفتح صفحة ميسّر المستضافة في WebView. العميل بيدفع
// (بطاقة/مدى/Apple Pay مع 3-D Secure)، ولما يرجع لرابط الـ callback بنتأكّد من
// حالة الدفع من السيرفر (اللي بدوره بيتأكّد من ميسّر عبر الـ webhook + API).
//
// بترجّع `true` لو الدفع اتأكّد، `false`/`null` لو اتلغى أو فشل.
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../../core/api_client.dart';
import '../../core/theme.dart';
import '../../data/api_repository.dart';

class PaymentWebViewScreen extends ConsumerStatefulWidget {
  const PaymentWebViewScreen({
    super.key,
    required this.orderId,
    required this.checkoutUrl,
  });

  final String orderId;
  final String checkoutUrl;

  @override
  ConsumerState<PaymentWebViewScreen> createState() => _PaymentWebViewScreenState();
}

class _PaymentWebViewScreenState extends ConsumerState<PaymentWebViewScreen> {
  late final WebViewController _controller;
  bool _loading = true;
  bool _verifying = false;
  Timer? _pollTimer;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageStarted: (url) {
            // رابط الرجوع بعد الدفع = إشارة إن العميل خلص — نتأكّد من السيرفر.
            if (url.contains('/payments/moyasar/callback') || url.contains('id=') && url.contains('status=')) {
              _verifyPayment();
            }
          },
          onPageFinished: (_) {
            if (mounted) setState(() => _loading = false);
          },
        ),
      )
      ..loadRequest(Uri.parse(widget.checkoutUrl));
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    super.dispose();
  }

  /// بنسأل السيرفر عن حالة الدفع (اللي بدوره أكّدها من ميسّر). بنعيد المحاولة
  /// كام مرة لأن الـ webhook ممكن يوصل بعد ثانية من رجوع العميل.
  Future<void> _verifyPayment() async {
    if (_verifying) return;
    setState(() => _verifying = true);

    final orders = ref.read(ordersRepositoryProvider);
    for (var attempt = 0; attempt < 8; attempt++) {
      try {
        final order = await orders.byId(widget.orderId);
        if (order.paymentStatus == 'PAID') {
          if (mounted) Navigator.of(context).pop(true);
          return;
        }
        if (order.paymentStatus == 'FAILED') {
          if (mounted) Navigator.of(context).pop(false);
          return;
        }
      } on ApiException {
        // نتجاهل ونعيد — الطلب اتعمل خلاص، بس التأكيد لسه بيوصل.
      }
      await Future<void>.delayed(const Duration(seconds: 2));
    }
    // ماوصلش تأكيد خلال المهلة — نرجّع بدون نتيجة قاطعة (الطلب معلّق الدفع).
    if (mounted) Navigator.of(context).pop(null);
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _confirmCancel();
      },
      child: Scaffold(
        backgroundColor: QColors.canvas,
        appBar: AppBar(
          backgroundColor: QColors.inkSurface,
          title: const Text(
            'الدفع الآمن',
            style: TextStyle(fontFamily: 'Cairo', fontWeight: FontWeight.w800, color: Colors.white),
          ),
          leading: IconButton(
            icon: const Icon(Icons.close, color: Colors.white),
            onPressed: _confirmCancel,
          ),
        ),
        body: Stack(
          children: [
            WebViewWidget(controller: _controller),
            if (_loading || _verifying)
              Container(
                color: Colors.white.withValues(alpha: 0.9),
                child: Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      CircularProgressIndicator(color: QColors.brand),
                      const SizedBox(height: 16),
                      Text(
                        _verifying ? 'جاري تأكيد الدفع…' : 'جاري تحميل صفحة الدفع…',
                        style: TextStyle(
                          fontFamily: 'Cairo',
                          fontWeight: FontWeight.w700,
                          color: QColors.ink,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  void _confirmCancel() {
    showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('إلغاء الدفع؟', style: TextStyle(fontFamily: 'Cairo')),
        content: const Text(
          'سُجِّل الطلب لكنه لم يُدفَع بعد، وسيظل بانتظار الدفع. يمكنك الدفع الآن، '
          'أو تطلب من جديد لو خرجت.',
          style: TextStyle(fontFamily: 'Cairo'),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: const Text('أكمّل الدفع', style: TextStyle(fontFamily: 'Cairo')),
          ),
          TextButton(
            onPressed: () {
              Navigator.of(dialogContext).pop();
              Navigator.of(context).pop(null);
            },
            child: Text('إلغاء', style: TextStyle(fontFamily: 'Cairo', color: QColors.danger)),
          ),
        ],
      ),
    );
  }
}
