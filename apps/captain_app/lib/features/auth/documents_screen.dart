// شاشة ٤: رفع الوثائق — هوية، رخصة، استمارة، تأمين، صورة شخصية.
//
// ✅ **الشاشة دي بقت حقيقية بالكامل**:
//   • الصفوف من `GET /captains/me/documents` — بيرجّع **خمس صفوف دايماً** بترتيب
//     ثابت، فالشاشة مابتخترعش ولا صف ومابتفترضش حالة.
//   • «رفع» بياخد صورة من المعرض أو الكاميرا → `POST /uploads` (بيرجّع رابط) →
//     `POST /captains/me/documents` (بيسجّل الرابط على النوع) → إعادة قراءة.
//   • الحالة والألوان وسبب الرفض وتاريخ الانتهاء كلهم من السيرفر.
//
// ℹ️ **مافيش endpoint منفصل لـ «إرسال للمراجعة» ومش محتاجينه**: أي رفع بيحط
// الوثيقة على PENDING تلقائياً على السيرفر (الـ upsert بيصفّر الحالة)، يعني
// **الرفع نفسه هو الإرسال**. الزرار تحت بيأكّد للكابتن إن كله وصل ويرجّعه بس.
//
// ❌ اللي لسه ناقص: التحقق بالوجه (`faceVerifiedAt` مالوش مسار بيكتب فيه).
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../core/api_client.dart';
import '../../core/theme.dart';
import '../../models/captain.dart';
import '../../providers/captain_status_provider.dart';
import '../../widgets/common.dart';

class DocumentsScreen extends ConsumerStatefulWidget {
  const DocumentsScreen({super.key});

  @override
  ConsumerState<DocumentsScreen> createState() => _DocumentsScreenState();
}

class _DocumentsScreenState extends ConsumerState<DocumentsScreen> {
  /// نوع الوثيقة اللي بترفع دلوقتي — عشان نبيّن التقدّم على صفها هي بس.
  String? _uploading;

  /// يختار مصدر الصورة ثم يرفع.
  Future<void> _startUpload(CaptainDocument document) async {
    final source = await showModalBottomSheet<ImageSource>(
      context: context,
      builder: (_) => _SourceSheet(title: document.typeLabel),
    );
    if (source == null || !mounted) return;

    // اختيار الصورة نفسه ممكن يترفض من المستخدم — ساعتها بنخرج بهدوء.
    final XFile? picked;
    try {
      picked = await ImagePicker().pickImage(
        source: source,
        maxWidth: 2000,
        imageQuality: 85,
      );
    } catch (_) {
      if (!mounted) return;
      _snack(context, 'تعذّر فتح الكاميرا أو المعرض');
      return;
    }
    if (picked == null || !mounted) return;

    setState(() => _uploading = document.typeWire);

    try {
      // تاريخ الانتهاء بيتحدد من الأدمن وقت المراجعة، مش من الكابتن.
      await ref.read(documentsProvider.notifier).upload(
            type: document.typeWire,
            file: File(picked.path),
          );
      if (!mounted) return;
      _snack(context, 'تم رفع ${document.typeLabel} — تحت المراجعة الآن');
    } on ApiException catch (e) {
      if (!mounted) return;
      _snack(context, e.message);
    } finally {
      if (mounted) setState(() => _uploading = null);
    }
  }

  /// الرفع = الإرسال (شوف تعليق أول الملف) — بنأكّد ونرجّع بس.
  Future<void> _confirmSubmission() async {
    await ref.read(documentsProvider.notifier).refresh();
    if (!mounted) return;
    _snack(context, 'وثائقك تحت المراجعة');
    await Navigator.of(context).maybePop();
  }

  @override
  Widget build(BuildContext context) {
    final documentsAsync = ref.watch(documentsProvider);
    final documents = documentsAsync.valueOrNull ?? const <CaptainDocument>[];

    // شريط التقدّم بيعدّ **الإلزامية بس** — الصورة الشخصية اختيارية فمابتتحسبش.
    final required = documents.where((d) => d.isRequired).toList();
    final approved = required.where((d) => d.status.isApproved).length;
    final total = required.length;
    final allUploaded = required.isNotEmpty && required.every((d) => d.isUploaded);

    return Scaffold(
      backgroundColor: QColors.canvas,
      appBar: QHeader(
        title: 'وثائق التفعيل',
        subtitle: Padding(
          padding: const EdgeInsets.only(top: 2),
          child: Text.rich(
            TextSpan(
              text: 'اكتمل ',
              style: QText.caption,
              children: [
                TextSpan(text: '$approved', style: QText.num(size: 13, color: QColors.gold)),
                const TextSpan(text: ' من '),
                TextSpan(text: '$total', style: QText.num(size: 13, color: QColors.gold)),
              ],
            ),
          ),
        ),
        bottom: _ProgressTrack(value: total == 0 ? 0 : approved / total),
      ),
      body: documentsAsync.when(
        loading: () => const QLoading(),
        error: (error, _) => QErrorView(
          message: error is ApiException ? error.message : 'تعذّر تحميل وثائقك',
          onRetry: () => ref.invalidate(documentsProvider),
        ),
        data: (rows) => RefreshIndicator(
          color: QColors.ink,
          onRefresh: () => ref.read(documentsProvider.notifier).refresh(),
          child: ListView(
            padding: const EdgeInsets.fromLTRB(
              QSpace.screenH,
              QSpace.gapLg,
              QSpace.screenH,
              QSpace.gapLg,
            ),
            children: [
              for (final document in rows) ...[
                _DocumentRow(
                  document: document,
                  uploading: _uploading == document.typeWire,
                  onUpload: () => _startUpload(document),
                ),
                const SizedBox(height: QSpace.gap),
              ],
              const SizedBox(height: 4),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                decoration: BoxDecoration(
                  color: QColors.tint,
                  borderRadius: BorderRadius.circular(QRadius.md),
                  border: Border.all(color: QColors.tintBorder),
                ),
                child: Text(
                  '💡 بعد قبول الوثائق الإلزامية هيتفعل حسابك تلقائياً وتقدر تستقبل طلبات',
                  style: TextStyle(
                    fontFamily: 'Cairo',
                    fontSize: 12.5,
                    fontWeight: FontWeight.w700,
                    color: QColors.goldDeep,
                    height: 1.6,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
      bottomNavigationBar: QBottomBar(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            QButton(
              label: 'إرسال للمراجعة',
              enabled: allUploaded,
              onPressed: _confirmSubmission,
            ),
            if (!allUploaded) ...[
              const SizedBox(height: 8),
              Text(
                'ارفع الوثائق الإلزامية الأول',
                textAlign: TextAlign.center,
                style: QText.tiny.copyWith(fontWeight: FontWeight.w600, color: QColors.faint),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// اختيار مصدر الصورة — المعرض أو الكاميرا.
class _SourceSheet extends StatelessWidget {
  const _SourceSheet({required this.title});

  final String title;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(QSpace.screenH, 18, QSpace.screenH, 18),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('رفع $title', style: QText.section),
            const SizedBox(height: 4),
            Text(
              'صورة واضحة، أقل من ٨ ميجا',
              style: QText.tiny.copyWith(fontWeight: FontWeight.w600, color: QColors.faint),
            ),
            const SizedBox(height: 16),
            QTileGroup(
              children: [
                QListTile(
                  emoji: '🖼',
                  title: 'من المعرض',
                  onTap: () => Navigator.of(context).pop(ImageSource.gallery),
                ),
                QListTile(
                  emoji: '📷',
                  title: 'من الكاميرا',
                  onTap: () => Navigator.of(context).pop(ImageSource.camera),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// شريط التقدّم ٦ بكسل تحت عنوان الشاشة.
class _ProgressTrack extends StatelessWidget {
  const _ProgressTrack({required this.value});

  /// من ٠ لـ ١.
  final double value;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(QRadius.pill),
      child: Container(
        height: 6,
        color: QColors.line,
        child: FractionallySizedBox(
          alignment: AlignmentDirectional.centerStart,
          widthFactor: value.clamp(0.0, 1.0),
          child: Container(color: QColors.brand),
        ),
      ),
    );
  }
}

class _DocumentRow extends StatelessWidget {
  const _DocumentRow({
    required this.document,
    required this.uploading,
    required this.onUpload,
  });

  final CaptainDocument document;
  final bool uploading;
  final VoidCallback onUpload;

  /// لون سطر الحالة ومربع الإيموجي — بيتبع حالة السيرفر مباشرة.
  Color get _statusColor => switch (document.status) {
        CaptainDocStatus.approved => QColors.success,
        CaptainDocStatus.pending => QColors.gold,
        CaptainDocStatus.rejected || CaptainDocStatus.expired => QColors.danger,
        CaptainDocStatus.missing => QColors.textMuted,
      };

  Color get _tileColor => switch (document.status) {
        CaptainDocStatus.approved => QColors.successTint,
        CaptainDocStatus.pending => QColors.tintStrong,
        CaptainDocStatus.rejected || CaptainDocStatus.expired => QColors.dangerBorder,
        CaptainDocStatus.missing => QColors.chip,
      };

  @override
  Widget build(BuildContext context) {
    final missing = document.status.isMissing;
    final warning = document.expiryWarning;

    final content = Row(
      children: [
        Container(
          width: 46,
          height: 46,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: _tileColor,
            borderRadius: BorderRadius.circular(QRadius.md),
          ),
          child: Text(document.typeEmoji, style: const TextStyle(fontSize: 21)),
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
                      document.typeLabel,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontFamily: 'Cairo',
                        fontSize: 14.5,
                        fontWeight: FontWeight.w800,
                        color: QColors.ink,
                      ),
                    ),
                  ),
                  if (!document.isRequired) ...[
                    const SizedBox(width: 6),
                    Text(
                      '(اختيارية)',
                      style: QText.tiny.copyWith(
                        fontSize: 10.5,
                        color: QColors.faint,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ],
              ),
              const SizedBox(height: 3),
              Text(
                document.statusLine,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontFamily: 'Cairo',
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: _statusColor,
                ),
              ),
              // تحذير قرب الانتهاء — بيبان لما يبقى فاضل ٣٠ يوم أو أقل.
              if (warning != null) ...[
                const SizedBox(height: 6),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
                  decoration: BoxDecoration(
                    color: QColors.tint,
                    borderRadius: BorderRadius.circular(QRadius.pill),
                    border: Border.all(color: QColors.tintBorder),
                  ),
                  child: Text(
                    warning,
                    style: TextStyle(
                      fontFamily: 'Cairo',
                      fontSize: 10.5,
                      fontWeight: FontWeight.w800,
                      color: QColors.goldDeep,
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
        const SizedBox(width: 10),
        if (uploading)
          SizedBox(
            width: 20,
            height: 20,
            child: CircularProgressIndicator(strokeWidth: 2.4, color: QColors.gold),
          )
        else
          _UploadPill(
            // المرفوضة والمنتهية محتاجة إعادة رفع، والمقبولة والمعلّقة ممكن تتبدّل.
            label: document.status.needsAction ? 'رفع' : 'تغيير',
            emphasised: document.status.needsAction,
            onTap: onUpload,
          ),
      ],
    );

    // الصف اللي لسه مترفعش بياخد إطار متقطّع يوضّح إنه ناقص.
    if (missing) {
      return Container(
        decoration: BoxDecoration(
          color: QColors.surface,
          borderRadius: BorderRadius.circular(QRadius.lg),
        ),
        child: CustomPaint(
          foregroundPainter: const _DashedBorderPainter(),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            child: content,
          ),
        ),
      );
    }

    return QCard(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      child: content,
    );
  }
}

/// زرار «رفع» / «تغيير» على يمين الصف.
class _UploadPill extends StatelessWidget {
  const _UploadPill({
    required this.label,
    required this.emphasised,
    required this.onTap,
  });

  final String label;

  /// الوثيقة محتاجة تدخّل — بياخد لون البراند بدل الرمادي.
  final bool emphasised;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(QRadius.pill),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 9),
        decoration: BoxDecoration(
          color: emphasised ? QColors.brand : QColors.chip,
          borderRadius: BorderRadius.circular(QRadius.pill),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontFamily: 'Cairo',
            fontSize: 13,
            fontWeight: FontWeight.w900,
            color: emphasised ? QColors.ink : QColors.label,
          ),
        ),
      ),
    );
  }
}

/// إطار متقطّع — مافيش واحد جاهز في فلاتر.
class _DashedBorderPainter extends CustomPainter {
  const _DashedBorderPainter();

  static const _radius = QRadius.lg;
  static const _dash = 6.0;
  static const _gap = 4.0;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = QColors.border
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.5;

    final path = Path()
      ..addRRect(
        RRect.fromRectAndRadius(
          Rect.fromLTWH(0, 0, size.width, size.height).deflate(0.75),
          const Radius.circular(_radius),
        ),
      );

    // بنمشي على محيط الشكل ونرسم شرطة ونسيب فراغ بالتناوب.
    for (final metric in path.computeMetrics()) {
      var distance = 0.0;
      while (distance < metric.length) {
        final next = (distance + _dash).clamp(0.0, metric.length);
        canvas.drawPath(metric.extractPath(distance, next), paint);
        distance = next + _gap;
      }
    }
  }

  @override
  bool shouldRepaint(_DashedBorderPainter oldDelegate) => false;
}

void _snack(BuildContext context, String message) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(
        backgroundColor: QColors.inkSurface,
        behavior: SnackBarBehavior.floating,
        content: Text(
          message,
          style: TextStyle(
            fontFamily: 'Cairo',
            fontSize: 13.5,
            fontWeight: FontWeight.w700,
            color: QColors.brand,
          ),
        ),
      ),
    );
}
