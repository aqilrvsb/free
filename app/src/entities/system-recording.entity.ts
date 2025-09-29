import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('fs_system_recordings')
export class SystemRecordingEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  name!: string;

  @Column({ name: 'original_filename' })
  originalFilename!: string;

  @Column({ name: 'storage_filename' })
  storageFilename!: string;

  @Column({ name: 'storage_path' })
  storagePath!: string;

  @Column({ name: 'mimetype', length: 128 })
  mimetype!: string;

  @Column({ name: 'size_bytes', type: 'bigint' })
  sizeBytes!: number;

  @Column({ name: 'playback_url' })
  playbackUrl!: string;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt!: Date;
}
