import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('fs_system_recordings')
export class SystemRecordingEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  name!: string;

  @Column({ name: 'original_filename' })
  originalFilename!: string;

  @Column({ name: 'storage_filename', nullable: true })
  storageFilename?: string | null;

  @Column({ name: 'storage_path', nullable: true })
  storagePath?: string | null;

  @Column({ name: 'mimetype', length: 128 })
  mimetype!: string;

  @Column({ name: 'size_bytes', type: 'bigint' })
  sizeBytes!: number;

  @Column({ name: 'playback_url', nullable: true })
  playbackUrl?: string | null;

  @Column({ name: 'storage_mode', type: 'varchar', length: 16, default: 'local' })
  storageMode!: 'local' | 'cdn';

  @Column({ name: 'cdn_key', type: 'varchar', length: 512, nullable: true })
  cdnKey?: string | null;

  @Column({ name: 'cdn_url', type: 'varchar', length: 1024, nullable: true })
  cdnUrl?: string | null;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt!: Date;
}
