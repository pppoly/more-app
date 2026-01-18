/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/require-await, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/no-unused-vars */
import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ClassesService } from './classes.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateClassDto, UpdateClassDto } from './dto/create-class.dto';
import { BatchCreateLessonsDto } from './dto/create-lessons.dto';

@Controller('console')
@UseGuards(JwtAuthGuard)
export class ClassesConsoleController {
  constructor(private readonly classesService: ClassesService) {}

  @Get('classes')
  listClasses(@Req() req: any) {
    return this.classesService.listConsoleClasses(req.user.id);
  }

  @Post('classes')
  createClass(@Req() req: any, @Body() body: CreateClassDto) {
    return this.classesService.createClass(req.user.id, body);
  }

  @Patch('classes/:classId')
  updateClass(@Req() req: any, @Param('classId') classId: string, @Body() body: UpdateClassDto) {
    return this.classesService.updateClass(req.user.id, classId, body);
  }

  @Post('classes/:classId/cover')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  uploadCover(@Req() req: any, @Param('classId') classId: string, @UploadedFile() file: Express.Multer.File) {
    return this.classesService.uploadClassCover(req.user.id, classId, file);
  }

  @Delete('classes/:classId')
  deleteClass(@Req() req: any, @Param('classId') classId: string) {
    return this.classesService.deleteClass(req.user.id, classId);
  }

  @Post('classes/:classId/lessons/batch')
  batchLessons(@Req() req: any, @Param('classId') classId: string, @Body() body: BatchCreateLessonsDto) {
    return this.classesService.batchCreateLessons(req.user.id, classId, body);
  }

  @Patch('lessons/:lessonId/cancel')
  cancelLesson(@Req() req: any, @Param('lessonId') lessonId: string) {
    return this.classesService.cancelLesson(req.user.id, lessonId);
  }

  @Delete('lessons/:lessonId')
  deleteLesson(@Req() req: any, @Param('lessonId') lessonId: string) {
    return this.classesService.deleteLesson(req.user.id, lessonId);
  }

  @Get('lessons/:lessonId/registrations')
  lessonRegistrations(@Req() req: any, @Param('lessonId') lessonId: string) {
    return this.classesService.getLessonRegistrations(req.user.id, lessonId);
  }

  @Get('lessons/:lessonId/payments/summary')
  lessonPayments(@Req() req: any, @Param('lessonId') lessonId: string) {
    return this.classesService.getLessonPaymentSummary(req.user.id, lessonId);
  }
}
